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
router.post("/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[ENZO server] Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    try {
      const payload = JSON.parse(session.metadata.orderPayload);

      const { data, error } = await supabaseAdmin.rpc("place_order", {
        p_customer_name: payload.fullName,
        p_phone: payload.phone,
        p_city: payload.city,
        p_address: payload.address,
        p_notes: payload.notes,
        p_payment_method: "visa",
        p_locale: payload.locale,
        p_user_id: payload.userId,
        p_email: payload.email,
        p_items: payload.items.map((i) => ({
          product_id: i.product_id,
          size: i.size ?? null,
          color: i.color ?? null,
          quantity: i.quantity,
        })),
        p_payment_status: "paid", // Stripe already confirmed the charge succeeded
        p_stripe_session_id: session.id,
      });

      if (error) {
        // This is a real problem worth knowing about (e.g. stock ran out
        // between checkout starting and payment completing) -- the
        // customer HAS been charged by Stripe at this point, so this
        // needs manual follow-up (a refund) rather than silently failing.
        console.error(
          `[ENZO server] Payment succeeded (session ${session.id}) but place_order failed:`,
          error.message,
          "-- THIS CUSTOMER WAS CHARGED. Manual refund/follow-up needed."
        );
      } else {
        console.log(`[ENZO server] Order #${data?.[0]?.order_number} created from Stripe session ${session.id}`);
      }
    } catch (err) {
      console.error("[ENZO server] Error processing Stripe webhook payload:", err.message);
    }
  }

  res.json({ received: true });
});

export default router;