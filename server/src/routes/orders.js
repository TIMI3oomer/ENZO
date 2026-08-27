import { Router } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { attachUser, requireAuth } from "../middleware/auth.js";
import { createOrderSchema, parseOrThrow } from "../utils/validation.js";

const router = Router();

// CHECKPOINT NOTE (server/src/routes/orders.js):
// THIS is the fix for the price-tampering issue in the old direct-to-
// Supabase checkout. The request body only ever contains product ids,
// sizes, and quantities — never a price. All money math happens inside
// the `place_order` Postgres function (supabase/migration_v3.sql), which
// looks up real prices and checks real stock, locking rows so two
// simultaneous purchases of the last item can't both succeed.
router.post("/", attachUser, async (req, res, next) => {
  try {
    const body = parseOrThrow(createOrderSchema, req.body);

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
        quantity: i.quantity,
      })),
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
