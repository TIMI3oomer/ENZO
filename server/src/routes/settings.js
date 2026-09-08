import { Router } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

const router = Router();

// Public, read-only — the frontend needs this to SHOW the delivery fee
// and currency symbol before checkout, but the actual charged amount is
// always recalculated server-side inside place_order() regardless of
// what this endpoint returns, so there's no way to tamper with pricing
// by messing with this response.
router.get("/", async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("store_settings")
      .select("delivery_fee, currency_symbol")
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;
    res.json(data || { delivery_fee: 0, currency_symbol: "₪" });
  } catch (err) {
    next(err);
  }
});

export default router;
