import { Router } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { attachUser, requireAdmin } from "../middleware/auth.js";
import {
  productSchema,
  orderStatusSchema,
  categorySchema,
  deliveryFeeSchema,
  paymentStatusSchema,
  parseOrThrow,
} from "../utils/validation.js";
import { sendOrderStatusEmail, sendOrderTotalEmail } from "../lib/email.js";

const router = Router();

// CHECKPOINT NOTE (server/src/routes/admin.js):
// Every route below runs attachUser -> requireAdmin first (applied via
// router.use), so nothing here is reachable without a verified Supabase
// session that's also listed in admin_users. This is now the REAL
// enforcement point for admin actions — RLS in the database is a second,
// independent layer behind it, not the only layer.
router.use(attachUser, requireAdmin);

// ---------- Dashboard stats ----------
router.get("/stats", async (_req, res, next) => {
  try {
    const [{ count: products }, { count: pendingOrders }, { count: totalOrders }] = await Promise.all([
      supabaseAdmin.from("products").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("orders").select("*", { count: "exact", head: true }),
    ]);
    res.json({ products: products || 0, pendingOrders: pendingOrders || 0, totalOrders: totalOrders || 0 });
  } catch (err) {
    next(err);
  }
});

// ---------- Products (full CRUD, including inactive) ----------
router.get("/products", async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from("products").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get("/products/:id", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from("products").select("*").eq("id", req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Product not found" });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post("/products", async (req, res, next) => {
  try {
    const body = parseOrThrow(productSchema, req.body);
    const { data, error } = await supabaseAdmin.from("products").insert(body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put("/products/:id", async (req, res, next) => {
  try {
    const body = parseOrThrow(productSchema, req.body);
    const { data, error } = await supabaseAdmin
      .from("products")
      .update(body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete("/products/:id", async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.from("products").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------- Orders (read + status update) ----------
router.get("/orders", async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from("orders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get("/orders/:id/items", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from("order_items").select("*").eq("order_id", req.params.id);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.patch("/orders/:id/status", async (req, res, next) => {
  try {
    const body = parseOrThrow(orderStatusSchema, req.body);
    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({ status: body.status, admin_note: body.note ?? null })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;

    // FIX: this used to be fire-and-forget (no await). On Vercel's
    // serverless runtime the function can be frozen the moment the response
    // is sent, so the email was often never delivered. It is awaited now;
    // email.js never throws (failures are only logged), so a bad SMTP
    // setup still cannot fail the status update itself.
    await sendOrderStatusEmail({
      to: data.customer_email,
      orderNumber: data.order_number,
      status: data.status,
      note: data.admin_note,
      locale: data.locale,
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Mark an order's payment as received (or not). Needed for Reflect
// transfers and cash on delivery: nothing confirms those automatically, so
// the store owner checks the money arrived (Reflect app / on delivery) and
// flips the order to "paid" here. Card orders are marked paid by the
// payment webhook itself and normally never need this.
router.patch("/orders/:id/payment-status", async (req, res, next) => {
  try {
    const body = parseOrThrow(paymentStatusSchema, req.body);
    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({ payment_status: body.payment_status })
      .eq("id", req.params.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Order not found" });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// CHECKPOINT NOTE: delivery cost varies by city, so it's never charged
// or guessed at checkout (see place_order() in schema.sql) -- every
// order starts with delivery_fee = 0 / delivery_fee_confirmed = false.
// This is where the admin fills in the real fee once they know it. It
// recalculates the order's total (subtotal + fee) AND is what actually
// triggers sendOrderTotalEmail below -- this is the "full price" email
// the customer is waiting for after checkout.
router.patch("/orders/:id/delivery-fee", async (req, res, next) => {
  try {
    const body = parseOrThrow(deliveryFeeSchema, req.body);

    const { data: order, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select("subtotal, customer_email, order_number, locale")
      .eq("id", req.params.id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!order) return res.status(404).json({ error: "Order not found" });

    const total = Number(order.subtotal) + body.delivery_fee;

    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({ delivery_fee: body.delivery_fee, delivery_fee_confirmed: true, total })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;

    // Awaited for the same serverless reason as the status-update email above.
    await sendOrderTotalEmail({
      to: order.customer_email,
      orderNumber: order.order_number,
      subtotal: order.subtotal,
      deliveryFee: body.delivery_fee,
      total,
      locale: order.locale,
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ---------- Analytics (for dashboard charts) ----------
// CHECKPOINT NOTE: aggregates in JS rather than SQL for simplicity — fine
// at small-store order volumes. If order count grows into the thousands,
// move this to a SQL view/function instead of fetching every row here.
router.get("/analytics", async (_req, res, next) => {
  try {
    // orders and order_items don't depend on each other -- fetched in
    // parallel instead of two round trips back-to-back.
    const [
      { data: orders, error: ordersError },
      { data: items, error: itemsError },
    ] = await Promise.all([
      supabaseAdmin.from("orders").select("created_at, total, status").order("created_at", { ascending: true }),
      supabaseAdmin.from("order_items").select("product_name, quantity"),
    ]);
    if (ordersError) throw ordersError;
    if (itemsError) throw itemsError;

    // Last 14 days, orders + revenue per day.
    const dayMap = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = { date: key, orders: 0, revenue: 0 };
    }
    for (const o of orders) {
      const key = o.created_at.slice(0, 10);
      if (dayMap[key]) {
        dayMap[key].orders += 1;
        dayMap[key].revenue += Number(o.total);
      }
    }
    const salesByDay = Object.values(dayMap);

    // Status breakdown, for a pie/donut chart.
    const statusCounts = {};
    for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

    // Top 5 products by units sold.
    const productTotals = {};
    for (const i of items) {
      const name = i.product_name?.en || i.product_name?.ar || "?";
      productTotals[name] = (productTotals[name] || 0) + i.quantity;
    }
    const topProducts = Object.entries(productTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, quantity]) => ({ name, quantity }));

    res.json({ salesByDay, statusBreakdown, topProducts });
  } catch (err) {
    next(err);
  }
});

// ---------- Categories (full CRUD — admin names/edits/removes their own) ----------
// CHECKPOINT NOTE: deleting a category is safe for existing products —
// products.category_id has `on delete set null` (see schema.sql), so a
// product just becomes "uncategorized" rather than being deleted too.
router.post("/categories", async (req, res, next) => {
  try {
    const body = parseOrThrow(categorySchema, req.body);
    const { data, error } = await supabaseAdmin.from("categories").insert(body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put("/categories/:id", async (req, res, next) => {
  try {
    const body = parseOrThrow(categorySchema, req.body);
    const { data, error } = await supabaseAdmin
      .from("categories")
      .update(body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete("/categories/:id", async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.from("categories").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------- Customers ----------
// CHECKPOINT NOTE: emails/login info live in Supabase Auth (auth.users),
// which isn't a normal queryable table -- it's reached through the admin
// Auth API (supabaseAdmin.auth.admin.listUsers()). This merges that with
// the "profiles" table (phone/address) added in migration_v4.sql, plus a
// quick order count per customer.
router.get("/customers", async (_req, res, next) => {
  try {
    // Auth users, profiles, and orders are three independent lookups --
    // fetched in parallel instead of three round trips back-to-back.
    const [
      { data: authData, error: authError },
      { data: profiles, error: profileError },
      { data: orders, error: ordersError },
    ] = await Promise.all([
      // FIX: listUsers() returns only the first 50 users by default, so the
      // customer list silently stopped at 50. 1000 is the API's maximum page.
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabaseAdmin.from("profiles").select("*"),
      supabaseAdmin.from("orders").select("user_id"),
    ]);
    if (authError) throw authError;
    if (profileError) throw profileError;
    if (ordersError) throw ordersError;

    const orderCounts = {};
    for (const o of orders) {
      if (!o.user_id) continue;
      orderCounts[o.user_id] = (orderCounts[o.user_id] || 0) + 1;
    }

    const profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, p]));

    const customers = authData.users.map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      fullName: profileMap[u.id]?.full_name || u.user_metadata?.full_name || "",
      phone: profileMap[u.id]?.phone || "",
      city: profileMap[u.id]?.default_city || "",
      address: profileMap[u.id]?.default_address || "",
      orderCount: orderCounts[u.id] || 0,
    }));

    res.json(customers);
  } catch (err) {
    next(err);
  }
});

export default router;
