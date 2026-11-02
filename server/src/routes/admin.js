import { Router } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { stripe } from "../lib/stripe.js";
import { attachUser, requireAdmin } from "../middleware/auth.js";
import {
  productSchema,
  orderStatusSchema,
  categorySchema,
  paymentStatusSchema,
  discountCodeSchema,
  discountCodeUpdateSchema,
  itemRefundSchema,
  itemExchangeSchema,
  addAdminSchema,
  contentPageSchema,
  inStoreSaleSchema,
  refundSchema,
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

    // DELIVERY FEE IS AUTOMATIC: new orders are charged their region's fee
    // at checkout (place_order). An older order still missing it gets the
    // same region fee the moment it's confirmed -- there's no manual fee
    // entry anymore.
    if (body.status === "confirmed") await applyRegionDeliveryFee(req.params.id);

    // Goes through the set_order_status() database function (not a plain
    // UPDATE) so cancelling an order puts its items back in stock -- per
    // size -- and re-opening a cancelled order takes them again. See
    // supabase/schema.sql.
    const { data, error } = await supabaseAdmin.rpc("set_order_status", {
      p_order_id: req.params.id,
      p_status: body.status,
      p_note: body.note ?? null,
    });
    if (error) {
      // The function raises readable messages on purpose ("Cannot re-open
      // this order: only 0 left of ... in size M", "Order not found").
      const err = new Error(error.message);
      err.status = error.code === "P0001" ? 400 : 500;
      throw err;
    }

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

// Sets an order's delivery fee from its delivery region (the same
// delivery_fee_for_region() the checkout uses) if it isn't set yet, and
// emails the customer the final total. No-op for orders that already have
// their fee, in-store sales, and old orders with no region recorded.
async function applyRegionDeliveryFee(orderId) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("subtotal, delivery_fee_confirmed, delivery_region, channel, customer_email, order_number, locale")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order || order.delivery_fee_confirmed || order.channel === "in_store" || !order.delivery_region) return;

  const { data: fee, error: feeError } = await supabaseAdmin.rpc("delivery_fee_for_region", {
    p_region: order.delivery_region,
  });
  if (feeError) throw feeError;
  if (fee == null) return;

  const total = Number(order.subtotal) + Number(fee);
  const { error: updateError } = await supabaseAdmin
    .from("orders")
    .update({ delivery_fee: fee, delivery_fee_confirmed: true, total })
    .eq("id", orderId);
  if (updateError) throw updateError;

  await sendOrderTotalEmail({
    to: order.customer_email,
    orderNumber: order.order_number,
    subtotal: order.subtotal,
    deliveryFee: fee,
    total,
    locale: order.locale,
  });
}

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

// Refund an order: issues the actual money-back (Stripe, for card
// payments) FIRST -- only once that succeeds do we touch the database --
// then puts it through set_order_status('cancelled') so stock is given
// back exactly the same way a decline/cancel already does (nothing
// restocked if it was never confirmed in the first place), and finally
// marks payment_status 'refunded'. cod/reflect orders have no Stripe
// charge to reverse -- the money was handed back by hand/bank transfer,
// so this just records that it happened and restocks.
router.patch("/orders/:id/refund", async (req, res, next) => {
  try {
    const body = parseOrThrow(refundSchema, req.body);

    const { data: order, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select("id, payment_method, payment_status, stripe_session_id, status")
      .eq("id", req.params.id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.payment_status === "refunded") {
      return res.status(400).json({ error: "This order has already been refunded" });
    }

    if (order.payment_method === "visa" && order.stripe_session_id) {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      if (!session.payment_intent) throw new Error("Stripe session has no payment_intent to refund");
      await stripe.refunds.create(
        { payment_intent: session.payment_intent },
        { idempotencyKey: `enzo_admin_refund_${order.id}` }
      );
    }

    if (order.status !== "cancelled") {
      const { error: statusError } = await supabaseAdmin.rpc("set_order_status", {
        p_order_id: order.id,
        p_status: "cancelled",
        p_note: body.note ?? null,
      });
      if (statusError) throw statusError;
    }

    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({ payment_status: "refunded" })
      .eq("id", order.id)
      .select()
      .single();
    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ---------- Item refund / exchange ----------
// Change part of one line of an order: refund it, or swap it for another
// product/size/color. The database moves the stock (if the order had
// already taken it), re-prices the order, re-calculates the customer's
// points and logs it (refund_order_item / exchange_order_item in
// migration_v16.sql). moneyDiff < 0 means the store owes the customer
// that much; > 0 means the customer pays the difference. Money itself is
// settled by hand (cash / Reflect / Stripe dashboard).
function rpcError(error) {
  const err = new Error(error.message);
  err.status = error.code === "P0001" ? 400 : 500;
  return err;
}

router.post("/order-items/:id/refund", async (req, res, next) => {
  try {
    const body = parseOrThrow(itemRefundSchema, req.body);
    const { data, error } = await supabaseAdmin.rpc("refund_order_item", {
      p_item_id: req.params.id,
      p_quantity: body.quantity,
      p_note: body.note ?? null,
    });
    if (error) throw rpcError(error);
    const r = data?.[0];
    res.json({ moneyDiff: Number(r.money_diff), pointsDelta: r.points_delta, total: Number(r.order_total) });
  } catch (err) {
    next(err);
  }
});

router.post("/order-items/:id/exchange", async (req, res, next) => {
  try {
    const body = parseOrThrow(itemExchangeSchema, req.body);
    const { data, error } = await supabaseAdmin.rpc("exchange_order_item", {
      p_item_id: req.params.id,
      p_quantity: body.quantity,
      p_new_product_id: body.product_id,
      p_new_size: body.size ?? null,
      p_new_color: body.color ?? null,
      p_note: body.note ?? null,
    });
    if (error) throw rpcError(error);
    const r = data?.[0];
    res.json({ moneyDiff: Number(r.money_diff), pointsDelta: r.points_delta, total: Number(r.order_total) });
  } catch (err) {
    next(err);
  }
});

router.get("/orders/:id/returns", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("order_returns")
      .select("*")
      .eq("order_id", req.params.id)
      .order("created_at");
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ---------- Admins (store owners) ----------
// Everyone in admin_users can open /admin. Any admin can add another by
// email; two guards keep the store from locking itself out: you can't
// remove yourself, and the last admin can't be removed. requireAdmin
// checks admin_users on every request, so removal takes effect at once.
async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  return null;
}

router.get("/admins", async (req, res, next) => {
  try {
    const { data: admins, error } = await supabaseAdmin
      .from("admin_users")
      .select("user_id, full_name, created_at")
      .order("created_at");
    if (error) throw error;

    const withEmails = await Promise.all(
      admins.map(async (a) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(a.user_id);
        const u = data?.user;
        return {
          ...a,
          email: u?.email ?? null,
          // invited but hasn't set a password / signed in yet
          pending: Boolean(u && !u.last_sign_in_at),
          isYou: a.user_id === req.user.id,
        };
      })
    );
    res.json(withEmails);
  } catch (err) {
    next(err);
  }
});

router.post("/admins", async (req, res, next) => {
  try {
    const body = parseOrThrow(addAdminSchema, req.body);
    let user = await findUserByEmail(body.email);
    let invited = false;

    if (!user) {
      if (!body.invite) {
        return res.status(404).json({ error: "No account uses that email yet", code: "no_account" });
      }
      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").split(",")[0].trim();
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(body.email, {
        redirectTo: `${frontendUrl}/account`,
        data: body.full_name ? { full_name: body.full_name } : undefined,
      });
      if (error) {
        const err = new Error(`Couldn't send the invite: ${error.message}`);
        err.status = 400;
        throw err;
      }
      user = data.user;
      invited = true;
    }

    const { error } = await supabaseAdmin
      .from("admin_users")
      .upsert({ user_id: user.id, full_name: body.full_name || user.user_metadata?.full_name || null });
    if (error) throw error;

    res.status(201).json({ user_id: user.id, email: user.email, invited });
  } catch (err) {
    next(err);
  }
});

router.delete("/admins/:userId", async (req, res, next) => {
  try {
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: "You can't remove your own admin access" });
    }
    const { count, error: countError } = await supabaseAdmin
      .from("admin_users")
      .select("user_id", { count: "exact", head: true });
    if (countError) throw countError;
    if (count <= 1) return res.status(400).json({ error: "The store needs at least one admin" });

    // Only takes away admin access -- their customer account and orders stay.
    const { error } = await supabaseAdmin.from("admin_users").delete().eq("user_id", req.params.userId);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------- Discount codes ----------
router.get("/discount-codes", async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from("discount_codes").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post("/discount-codes", async (req, res, next) => {
  try {
    const body = parseOrThrow(discountCodeSchema, req.body);
    const { data, error } = await supabaseAdmin.from("discount_codes").insert(body).select().single();
    if (error) {
      if (error.code === "23505") {
        const err = new Error("That code already exists");
        err.status = 400;
        throw err;
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.patch("/discount-codes/:id", async (req, res, next) => {
  try {
    const body = parseOrThrow(discountCodeUpdateSchema, req.body);
    const { data, error } = await supabaseAdmin.from("discount_codes").update(body).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete("/discount-codes/:id", async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.from("discount_codes").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// In-store sales since `since` (the till page sends the start of today,
// in the shop's own timezone), totalled per seller.
router.get("/in-store-sales/summary", async (req, res, next) => {
  try {
    const since = new Date(String(req.query.since || ""));
    if (Number.isNaN(since.getTime())) return res.status(400).json({ error: "since must be a date" });
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("seller, total, status")
      .eq("channel", "in_store")
      .gte("created_at", since.toISOString());
    if (error) throw error;
    const bySeller = {};
    for (const o of data) {
      if (o.status === "cancelled") continue;
      const key = o.seller || "";
      bySeller[key] = bySeller[key] || { seller: o.seller || null, count: 0, total: 0 };
      bySeller[key].count += 1;
      bySeller[key].total += Number(o.total);
    }
    res.json(Object.values(bySeller).sort((a, b) => b.total - a.total));
  } catch (err) {
    next(err);
  }
});

// ---------- In-store sales (real shop, not just the website) ----------
// Records a walk-in sale the admin rings up in person: same products/
// stock pool as the site, taken immediately (see record_in_store_sale()
// in schema.sql) rather than on a separate confirm step, since the item
// has already left the shelf by the time this is entered.
router.post("/in-store-sales", async (req, res, next) => {
  try {
    const body = parseOrThrow(inStoreSaleSchema, req.body);
    const { data, error } = await supabaseAdmin.rpc("record_in_store_sale", {
      p_items: body.items.map((i) => ({
        product_id: i.product_id,
        size: i.size ?? null,
        color: i.color ?? null,
        quantity: i.quantity,
      })),
      p_customer_name: body.customerName || "Walk-in customer",
      p_note: body.note || null,
    });
    if (error) {
      const err = new Error(error.message);
      err.status = 400;
      throw err;
    }
    const result = data?.[0];

    // Who rang it up (orders.seller, migration_v17.sql). If that migration
    // hasn't been run yet the sale is still recorded -- only the seller
    // name is skipped -- so the shop never gets stuck at the till.
    let sellerSaved = true;
    if (body.seller) {
      const { error: sellerError } = await supabaseAdmin.from("orders").update({ seller: body.seller }).eq("id", result.order_id);
      if (sellerError) {
        sellerSaved = false;
        console.warn("[ENZO server] seller not saved (run migration_v17.sql):", sellerError.message);
      }
    }

    // The full order + its items, so the admin screen can print the
    // invoice (فاتورة) straight away from what was actually recorded.
    const [{ data: order, error: orderError }, { data: items, error: itemsError }] = await Promise.all([
      supabaseAdmin.from("orders").select("*").eq("id", result.order_id).single(),
      supabaseAdmin.from("order_items").select("*").eq("order_id", result.order_id),
    ]);
    if (orderError) throw orderError;
    if (itemsError) throw itemsError;

    res.status(201).json({ orderNumber: result.order_number, total: result.total, order, items, sellerSaved });
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
      points: profileMap[u.id]?.points ?? 0,
    }));

    res.json(customers);
  } catch (err) {
    next(err);
  }
});

// One customer's full order history (newest first) with each order's
// items. Matches orders placed while signed in (user_id) AND guest orders
// placed with the same email, so a customer who sometimes checks out
// without logging in still sees everything in one place.
router.get("/customers/:id/orders", async (req, res, next) => {
  try {
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
    if (userError) throw userError;
    const email = userData?.user?.email?.toLowerCase() || null;

    const [byUser, byEmail] = await Promise.all([
      supabaseAdmin.from("orders").select("*").eq("user_id", req.params.id),
      email
        ? supabaseAdmin.from("orders").select("*").is("user_id", null).ilike("customer_email", email)
        : Promise.resolve({ data: [] }),
    ]);
    if (byUser.error) throw byUser.error;
    if (byEmail.error) throw byEmail.error;

    const orders = [...byUser.data, ...byEmail.data].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (orders.length === 0) return res.json([]);

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .in("order_id", orders.map((o) => o.id));
    if (itemsError) throw itemsError;

    res.json(orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) })));
  } catch (err) {
    next(err);
  }
});

// ---------- CMS content (manifest-driven page text/images) ----------
// The dashboard editor loads current content from the public
// GET /api/content/:page (same data, no admin-only fields to hide) and
// saves everything for that page in one PUT here.
router.put("/content/:page", async (req, res, next) => {
  try {
    const { page } = req.params;
    const body = parseOrThrow(contentPageSchema, req.body);

    if (body.items.length > 0) {
      const rows = body.items.map((item) => ({
        page,
        section: item.section,
        key: item.key,
        value: item.value ?? null,
        updated_by: req.user.id,
      }));
      const { error } = await supabaseAdmin
        .from("content_items")
        .upsert(rows, { onConflict: "page,section,key" });
      if (error) throw error;
    }

    // Collections are replaced whole-section-at-a-time: every section
    // present in this save gets its old rows deleted and the submitted
    // ones inserted in order. A section left out of the payload entirely
    // is untouched, so the dashboard editor must always submit the full
    // current state of every section it's editing, including an emptied one.
    const sections = [...new Set(body.collections.map((c) => c.section))];
    for (const section of sections) {
      const { error: delError } = await supabaseAdmin
        .from("content_collections")
        .delete()
        .eq("page", page)
        .eq("section", section);
      if (delError) throw delError;
    }
    if (body.collections.length > 0) {
      const rows = body.collections.map((c, idx) => ({
        page,
        section: c.section,
        sort_order: c.sort_order ?? idx,
        data: c.data,
        updated_by: req.user.id,
      }));
      const { error: insError } = await supabaseAdmin.from("content_collections").insert(rows);
      if (insError) throw insError;
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
