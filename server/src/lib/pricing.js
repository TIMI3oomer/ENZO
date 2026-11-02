import { supabaseAdmin } from "./supabaseAdmin.js";

// CHECKPOINT NOTE (server/src/lib/pricing.js):
// Works out an order's money BEFORE it's placed -- items, discount code,
// points, delivery -- with the exact same rules place_order() applies in
// the database (supabase/migration_v16.sql). Used for:
// - POST /api/orders/quote: the checkout shows the real totals and tells
//   the customer right away if their code or points can't be used.
// - POST /api/orders/stripe-session: Stripe has to charge the discounted
//   amount, so the discount is turned into a one-off Stripe coupon.
// place_order() still re-checks everything when the order is actually
// created; this never decides what's charged on its own.

// 500 points per full 100 ILS once the amount reaches 100 ILS; 100 points = 1 ILS.
export const POINTS_PER_ILS = 100;
export function pointsForAmount(amount) {
  return amount >= 100 ? Math.floor(amount / 100) * 500 : 0;
}

// What points are counted on (same as points_base() in migration_v19.sql):
// only items NOT on sale, minus their share of any code/points discount
// (those discounts are spread over all items by value).
export function pointsBase(subtotal, fullPriceSubtotal, discounts) {
  if (subtotal <= 0) return 0;
  return Math.max(0, fullPriceSubtotal - (discounts * fullPriceSubtotal) / subtotal);
}

const round2 = (n) => Math.round(n * 100) / 100;

function fail(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export async function quoteOrder({ items, deliveryRegion, userId, pointsToRedeem = 0, discountCode }) {
  const ids = [...new Set(items.map((i) => i.product_id))];
  const { data: products, error } = await supabaseAdmin
    .from("products")
    .select("id, price, discount_percent, is_active")
    .in("id", ids);
  if (error) throw error;

  let subtotal = 0;
  let fullPriceSubtotal = 0; // items not on sale -- the only ones that earn points
  for (const item of items) {
    const p = products.find((x) => x.id === item.product_id);
    if (!p || !p.is_active) throw fail("One of the items in your cart is no longer available");
    subtotal += round2(p.price * (1 - (p.discount_percent || 0) / 100)) * item.quantity;
    if (!Number(p.discount_percent)) fullPriceSubtotal += Number(p.price) * item.quantity;
  }
  subtotal = round2(subtotal);

  let deliveryFee = 0;
  if (deliveryRegion) {
    const { data, error: feeError } = await supabaseAdmin.rpc("delivery_fee_for_region", { p_region: deliveryRegion });
    if (feeError) throw feeError;
    deliveryFee = Number(data) || 0;
  }

  // Discount code -- same checks, same order, same messages as place_order().
  let codeDiscount = 0;
  let code = null;
  const codeText = (discountCode || "").trim().toUpperCase();
  if (codeText) {
    const { data, error: codeError } = await supabaseAdmin.from("discount_codes").select("*").eq("code", codeText).maybeSingle();
    if (codeError) throw codeError;
    if (!data || !data.is_active) throw fail("This discount code is not valid");
    if (data.expires_at && new Date(data.expires_at) < new Date()) throw fail("This discount code has expired");
    if (data.max_uses != null && data.used_count >= data.max_uses) throw fail("This discount code has been used up");
    if (subtotal < Number(data.min_order)) throw fail(`This code needs an order of at least ${Number(data.min_order)} ILS`);
    codeDiscount =
      data.kind === "percent" ? round2((subtotal * Number(data.value)) / 100) : Math.min(Number(data.value), subtotal);
    code = { code: data.code, kind: data.kind, value: Number(data.value) };
  }

  // Points.
  let balance = 0;
  if (userId) {
    const { data } = await supabaseAdmin.from("profiles").select("points").eq("user_id", userId).maybeSingle();
    balance = data?.points ?? 0;
  }
  const redeem = Math.max(0, Math.floor(pointsToRedeem || 0));
  let pointsDiscount = 0;
  if (redeem > 0) {
    if (!userId) throw fail("Sign in to use your points");
    if (balance < redeem) throw fail(`You only have ${Math.max(balance, 0)} points`);
    pointsDiscount = round2(redeem / POINTS_PER_ILS);
    if (pointsDiscount > subtotal - codeDiscount) {
      throw fail(`You can use at most ${Math.floor((subtotal - codeDiscount) * POINTS_PER_ILS)} points on this order`);
    }
  }

  const itemsAfterDiscounts = round2(subtotal - codeDiscount - pointsDiscount);
  return {
    subtotal,
    code,
    codeDiscount,
    pointsRedeemed: redeem,
    pointsDiscount,
    deliveryFee,
    total: round2(itemsAfterDiscounts + deliveryFee),
    pointsEarned: userId ? pointsForAmount(pointsBase(subtotal, fullPriceSubtotal, codeDiscount + pointsDiscount)) : 0,
    // so the checkout can say why fewer points than the total suggests
    hasSaleItems: fullPriceSubtotal < subtotal,
    balance,
    // Most points this order can take (whole points, never past the items).
    maxRedeemable: userId ? Math.max(0, Math.min(balance, Math.floor((subtotal - codeDiscount) * POINTS_PER_ILS))) : 0,
  };
}
