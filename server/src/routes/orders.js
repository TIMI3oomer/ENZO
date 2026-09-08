import { Router } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { stripe } from "../lib/stripe.js";
import { attachUser, requireAuth } from "../middleware/auth.js";
import { createOrderSchema, parseOrThrow } from "../utils/validation.js";

const router = Router();

// CHECKPOINT NOTE (server/src/routes/orders.js):
// THIS is the fix for the price-tampering issue in the old direct-to-
// Supabase checkout. The request body only ever contains product ids,
// sizes, and quantities — never a price. All money math happens inside
// the `place_order` Postgres function, which looks up real prices and
// checks real stock, locking rows so two simultaneous purchases of the
// last item can't both succeed. It also now adds the delivery fee
// (read server-side from store_settings) to every order automatically.
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

    const productIds = body.items.map((i) => i.product_id);
    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, name, price, stock, is_active")
      .in("id", productIds);
    if (productsError) throw productsError;

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("delivery_fee, currency_symbol")
      .eq("id", true)
      .maybeSingle();
    const deliveryFee = settings?.delivery_fee || 0;
    const currency = "ils"; // Stripe currency code -- change here if you switch currency_symbol away from ₪

    const lineItems = body.items.map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) {
        const err = new Error("One of the items in your cart is no longer available");
        err.status = 400;
        throw err;
      }
      if (!product.is_active) {
        const err = new Error(`${product.name?.en || product.name?.ar} is no longer available`);
        err.status = 400;
        throw err;
      }
      if (product.stock < item.quantity) {
        const err = new Error(`Insufficient stock for ${product.name?.en || product.name?.ar}`);
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

    if (deliveryFee > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: Math.round(deliveryFee * 100),
          product_data: { name: "Delivery" },
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
      metadata: {
        // Stripe metadata values must be strings, so the cart + customer
        // info is JSON-encoded here and decoded again in the webhook.
        orderPayload: JSON.stringify({
          fullName: body.fullName,
          email: body.email || req.user?.email || null,
          phone: body.phone,
          city: body.city,
          address: body.address,
          notes: body.notes || null,
          locale: body.locale,
          userId: req.user?.id ?? null,
          items: body.items,
        }),
      },
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
      .select("order_number, total, status")
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

export default router;
