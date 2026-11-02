import { Router } from "express";
import express from "express";
import { stripe } from "../lib/stripe.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

const router = Router();

// CHECKPOINT NOTE (server/src/routes/webhooks.js):
// ACTION REQUIRED — set STRIPE_WEBHOOK_SECRET in your backend's
// environment variables. Get this by setting up a webhook endpoint in
// Stripe Dashboard -> Developers -> Webhooks -> "Add endpoint", pointing
// it at https://your-backend.vercel.app/api/webhooks/stripe, listening
// for the "checkout.session.completed" event. Stripe then shows you a
// "Signing secret" (starts with whsec_) -- that's this value.
//
// CRITICAL: this route uses express.raw() instead of the app-wide
// express.json(), and MUST be mounted in app.js BEFORE the global
// express.json() middleware runs. Stripe's signature verification needs
// the exact raw request bytes; if the body were already JSON-parsed by
// the time it gets here, the signature check would always fail.
//
// SECURITY: verifying the signature (stripe.webhooks.constructEvent) is
// what proves this request genuinely came from Stripe and wasn't forged
// by someone POSTing a fake "payment succeeded" event directly at this
// URL to get free orders. Never skip this check.
//
// FIXES in this version:
// - Previously, if place_order() failed AFTER the customer was charged
//   (e.g. the last item sold out while they were on Stripe's page), the
//   handler only logged "manual refund needed" and replied 200, so Stripe
//   never retried and the customer silently lost their money. It now
//   refunds the payment automatically.
// - Any unexpected error used to be swallowed and answered with 200 too.
//   Temporary failures (database unreachable, etc.) now answer 500 so
//   Stripe retries the event for up to 3 days; place_order() is
//   idempotent per Stripe session, so retries never create duplicates.
// - Only sessions Stripe reports as actually paid create an order.
router.post("/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[ENZO server] Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== "checkout.session.completed") {
    return res.json({ received: true });
  }

  const session = event.data.object;

  // "completed" can also fire for delayed payment methods before the money
  // has actually arrived. Card payments are "paid" immediately.
  if (session.payment_status !== "paid") {
    console.log(`[ENZO server] Session ${session.id} completed but payment_status=${session.payment_status}; ignoring.`);
    return res.json({ received: true });
  }

  let payload;
  try {
    payload = readOrderPayload(session.metadata);
  } catch (err) {
    // The order details can't be read, so no retry could ever succeed.
    console.error(`[ENZO server] Unreadable order payload on session ${session.id}:`, err.message);
    return refundAndAck(session, "unreadable_order_payload", res);
  }

  let result;
  try {
    result = await supabaseAdmin.rpc("place_order", {
      p_customer_name: payload.fullName,
      p_phone: payload.phone,
      p_city: payload.city,
      p_address: payload.address,
      p_notes: payload.notes,
      p_payment_method: "visa",
      p_locale: payload.locale,
      p_user_id: payload.userId,
      p_email: payload.email,
      // Sessions created before regions existed have no deliveryRegion;
      // west_bank (the cheapest) matches what those customers were
      // shown, and the admin can correct the fee from the Orders page.
      p_delivery_region: payload.deliveryRegion || "west_bank",
      p_items: payload.items.map((i) => ({
        product_id: i.product_id,
        size: i.size ?? null,
        color: i.color ?? null,
        quantity: i.quantity,
      })),
      p_points_redeem: payload.pointsToRedeem || 0,
      p_discount_code: payload.discountCode || null,
      p_payment_status: "paid", // Stripe already confirmed the charge succeeded
      p_stripe_session_id: session.id,
    });
  } catch (err) {
    console.error(`[ENZO server] place_order call crashed for session ${session.id}:`, err.message);
    return res.status(500).send("Temporary error, please retry");
  }

  const { data, error } = result;

  if (!error) {
    console.log(`[ENZO server] Order #${data?.[0]?.order_number} created from Stripe session ${session.id}`);
    return res.json({ received: true });
  }

  // 23505 = unique violation on stripe_session_id: two deliveries of the
  // same event raced each other and the other one already created the order.
  if (error.code === "23505") {
    console.log(`[ENZO server] Session ${session.id} already turned into an order; ignoring duplicate.`);
    return res.json({ received: true });
  }

  // P0001 = an exception raised on purpose by place_order() (out of stock,
  // product removed/inactive, bad region...). Retrying cannot fix it, and the
  // customer HAS been charged, so give the money back.
  if (error.code === "P0001") {
    console.error(`[ENZO server] Paid session ${session.id} could not become an order: ${error.message}`);
    return refundAndAck(session, "order_could_not_be_fulfilled", res);
  }

  // Anything else (network, database down, ...) is temporary: let Stripe retry.
  console.error(`[ENZO server] Temporary failure creating order for session ${session.id}:`, error.message);
  return res.status(500).send("Temporary error, please retry");
});

// Refunds the full payment for a session, then acknowledges the webhook.
// If the refund itself fails we answer 500 so Stripe retries the event --
// the idempotency key makes sure two attempts can never refund twice.
async function refundAndAck(session, reason, res) {
  try {
    if (!session.payment_intent) throw new Error("session has no payment_intent");
    await stripe.refunds.create(
      { payment_intent: session.payment_intent, metadata: { reason, session_id: session.id } },
      { idempotencyKey: `enzo_refund_${session.id}` }
    );
    console.log(`[ENZO server] Refunded session ${session.id} (${reason}).`);
    return res.json({ received: true });
  } catch (err) {
    console.error(
      `[ENZO server] REFUND FAILED for session ${session.id} (${reason}): ${err.message} -- refund this customer manually in the Stripe Dashboard.`
    );
    return res.status(500).send("Refund failed, please retry");
  }
}

// The order payload is split across orderPayload_0..N metadata keys
// (Stripe caps each value at 500 chars -- see toChunkedMetadata in
// orders.js). Sessions created before that change used a single
// "orderPayload" key, still supported here.
function readOrderPayload(metadata = {}) {
  if (metadata.orderPayloadChunks) {
    const count = Number(metadata.orderPayloadChunks);
    let json = "";
    for (let i = 0; i < count; i++) json += metadata[`orderPayload_${i}`] || "";
    return JSON.parse(json);
  }
  return JSON.parse(metadata.orderPayload);
}

export default router;
