import { Router } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { stripe } from "../lib/stripe.js";
import { attachUser, requireAuth } from "../middleware/auth.js";
import { createOrderSchema, parseOrThrow } from "../utils/validation.js";
import { cardEnabled, reflectConfig } from "../lib/payments.js";

const router = Router();

// CHECKPOINT NOTE (server/src/routes/orders.js):
// THIS is the fix for the price-tampering issue in the old direct-to-
// Supabase checkout. The request body only ever contains product ids,
// sizes, and quantities — never a price. All money math happens inside
// the `place_order` Postgres function, which looks up real prices and
// checks real stock, locking rows so two simultaneous purchases of the
// last item can't both succeed. DELIVERY FEE: the customer picks a region
// (west_bank / jerusalem / inside) and place_order() turns it into the fee
// itself (delivery_fee_for_region() in schema.sql) -- the client never
// sends a fee amount. The admin can still override it per order
// (PATCH /api/admin/orders/:id/delivery-fee).
//
// PAYMENT SPLIT: "cod" (cash on delivery) and "reflect" (manual transfer
// app) create the order immediately, same as before — no money has
// actually changed hands yet for either, they're both "pay later"
// methods. "visa" (card) is different: the order must NOT be created
// until Stripe actually confirms payment succeeded, otherwise a customer
// who abandons the card checkout page would still show up as a real
// order with stock reserved for nothing. So "visa" is rejected on this
// endpoint entirely — see POST /stripe-session below, which creates a
// Stripe Checkout Session instead, and the order only gets created by
// the webhook handler once payment is actually confirmed.
router.post("/", attachUser, async (req, res, next) => {
  try {
    const body = parseOrThrow(createOrderSchema, req.body);

    if (body.paymentMethod === "visa") {
      const err = new Error("Card payments must go through /api/orders/stripe-session");
      err.status = 400;
      throw err;
    }

    // Reflect is a manual transfer: without payout details configured the
    // customer would have nowhere to send the money, so don't accept it.
    if (body.paymentMethod === "reflect" && !reflectConfig().enabled) {
      const err = new Error("Reflect payment is not available right now -- please choose cash on delivery");
      err.status = 400;
      throw err;
    }

    const { data, error } = await supabaseAdmin.rpc("place_order", {
      p_customer_name: body.fullName,
      p_phone: body.phone,
      p_city: body.city,
      p_address: body.address,
      p_notes: body.notes || null,
      p_payment_method: body.paymentMethod,
      p_locale: body.locale,
      p_user_id: req.user?.id ?? null,
      p_email: body.email || req.user?.email || null,
      p_delivery_region: body.deliveryRegion,
      p_items: body.items.map((i) => ({
        product_id: i.product_id,
        size: i.size ?? null,
        color: i.color ?? null,
        quantity: i.quantity,
      })),
      // cod/reflect: money hasn't actually been collected yet, so this
      // stays 'pending' (the default) -- not 'paid'.
    });

    if (error) {
      // place_order raises clean, customer-safe messages (out of stock,
      // product not found, etc.) — safe to forward directly as a 400.
      const err = new Error(error.message);
      err.status = 400;
      throw err;
    }

    const result = data?.[0];
    res.status(201).json({
      orderNumber: result.order_number,
      total: result.total,
      deliveryFee: result.delivery_fee,
    });
  } catch (err) {
    next(err);
  }
});

// CHECKPOINT NOTE — Stripe Checkout Session creation.
// Prices for the Stripe line items are looked up from the database here,
// NEVER taken from the request body — same "don't trust the client for
// money" rule as place_order() itself. The order itself is NOT created
// yet at this point; the cart contents + customer info are stashed in
// the Checkout Session's `metadata` (Stripe stores this for us), and the
// webhook handler (server/src/routes/webhooks.js) reads that metadata
// back out once payment is confirmed to actually call place_order().
router.post("/stripe-session", attachUser, async (req, res, next) => {
  try {
    const body = parseOrThrow(createOrderSchema, req.body);
    if (body.paymentMethod !== "visa") {
      const err = new Error("This endpoint is only for card payments");
      err.status = 400;
      throw err;
    }

    // Card checkout is only offered when a card provider is configured
    // (see lib/payments.js) -- otherwise fail clearly instead of crashing
    // at the Stripe call with a confusing error.
    if (!cardEnabled()) {
      const err = new Error("Card payment is not available right now -- please choose another payment method");
      err.status = 400;
      throw err;
    }

    const productIds = body.items.map((i) => i.product_id);
    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, name, price, stock, sizes, size_stock, is_active")
      .in("id", productIds);
    if (productsError) throw productsError;

    // Delivery fee comes from the SAME database function place_order()
    // uses, so the amount Stripe charges always matches the order total
    // the webhook records afterward. Never taken from the request body.
    const { data: deliveryFee, error: feeError } = await supabaseAdmin.rpc("delivery_fee_for_region", {
      p_region: body.deliveryRegion,
    });
    if (feeError) throw feeError;
    if (deliveryFee == null) {
      const err = new Error("Please choose your delivery region");
      err.status = 400;
      throw err;
    }

    // Stripe currency code. Defaults to ILS (the store's price currency);
    // set STRIPE_CURRENCY only if your Stripe account must settle in another
    // currency -- prices in the database are NOT converted, so changing this
    // alone would charge the same number in a different currency.
    const currency = (process.env.STRIPE_CURRENCY || "ils").toLowerCase();

    // STOCK PER SIZE: total wanted per (product, size) across all cart
    // lines, so the same shirt+size in two colours is checked as one number.
    const wanted = new Map();
    for (const item of body.items) {
      const key = `${item.product_id}__${item.size ?? ""}`;
      wanted.set(key, (wanted.get(key) || 0) + item.quantity);
    }

    const lineItems = body.items.map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) {
        const err = new Error("One of the items in your cart is no longer available");
        err.status = 400;
        throw err;
      }
      const label = product.name?.en || product.name?.ar;
      if (!product.is_active) {
        const err = new Error(`${label} is no longer available`);
        err.status = 400;
        throw err;
      }

      const hasSizes = (product.sizes || []).length > 0;
      if (hasSizes && (!item.size || !product.sizes.includes(item.size))) {
        const err = new Error(`Please choose a size for ${label}`);
        err.status = 400;
        throw err;
      }
      const available = hasSizes ? Number(product.size_stock?.[item.size] ?? 0) : product.stock;
      if (available < wanted.get(`${item.product_id}__${item.size ?? ""}`)) {
        const err = new Error(
          hasSizes
            ? `Insufficient stock for ${label} (size ${item.size}): only ${available} left`
            : `Insufficient stock for ${label}`
        );
        err.status = 400;
        throw err;
      }
      return {
        quantity: item.quantity,
        price_data: {
          currency,
          unit_amount: Math.round(product.price * 100), // Stripe uses the smallest currency unit
          product_data: { name: product.name?.en || product.name?.ar || "Product" },
        },
      };
    });

    if (Number(deliveryFee) > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: Math.round(Number(deliveryFee) * 100),
          product_data: { name: body.locale === "ar" ? "رسوم التوصيل" : "Delivery" },
        },
      });
    }

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").split(",")[0].trim();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${frontendUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/checkout`,
      customer_email: body.email || req.user?.email || undefined,
      // Stripe metadata values must be strings AND are capped at 500
      // characters each. The JSON payload easily passes 500 chars with a
      // few cart items + an address (every product id alone is 36 chars),
      // which made Stripe reject the session -- card checkout broke for
      // bigger carts. It's split across numbered keys here and joined back
      // together in webhooks.js (readOrderPayload).
      metadata: toChunkedMetadata(
        JSON.stringify({
          fullName: body.fullName,
          email: body.email || req.user?.email || null,
          phone: body.phone,
          city: body.city,
          address: body.address,
          notes: body.notes || null,
          locale: body.locale,
          deliveryRegion: body.deliveryRegion,
          userId: req.user?.id ?? null,
          items: body.items,
        })
      ),
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

// CHECKPOINT NOTE — polling endpoint for the post-payment success page.
// The webhook that actually creates the order fires asynchronously and
// usually completes within a second or two, but the customer's browser
// redirect back from Stripe can arrive slightly before that. The
// frontend polls this a few times rather than assuming the order exists
// immediately. Looking up by Stripe's own session id (an unguessable
// token Stripe generates) is safe to expose without further auth --
// nobody can guess another customer's session id to see their order.
router.get("/by-session/:sessionId", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("order_number, subtotal, delivery_fee, total, status")
      .eq("stripe_session_id", req.params.sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Order not found yet" });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// A logged-in customer's own order history. Even though this uses the
// service_role client (which bypasses RLS), the query below manually
// filters by the verified user's id — req.user comes from a Supabase
// token verification, not from anything the client can fake.
router.get("/mine", attachUser, requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// CHECKPOINT NOTE: line items (product name/size/quantity) for one of a
// customer's own orders — this is what lets Account.jsx show "what did I
// order, what size, how many" per order, not just the total. Ownership is
// double-checked here (the order must belong to req.user.id) before the
// items are returned, so a customer can never read another order's items
// by guessing an id.
router.get("/:id/items", attachUser, requireAuth, async (req, res, next) => {
  try {
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, user_id")
      .eq("id", req.params.id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.user_id !== req.user.id) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { data, error } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .eq("order_id", req.params.id);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Stripe metadata: max 50 keys, 500 chars per value. 450-char chunks
// leave headroom; 40 chunks (~18KB) is far more than any real cart.
const METADATA_CHUNK = 450;
function toChunkedMetadata(json) {
  const chunks = [];
  for (let i = 0; i < json.length; i += METADATA_CHUNK) chunks.push(json.slice(i, i + METADATA_CHUNK));
  if (chunks.length > 40) {
    const err = new Error("Your order is too large for card payment -- please split it or choose cash on delivery");
    err.status = 400;
    throw err;
  }
  const metadata = { orderPayloadChunks: String(chunks.length) };
  chunks.forEach((c, i) => {
    metadata[`orderPayload_${i}`] = c;
  });
  return metadata;
}

export default router;
