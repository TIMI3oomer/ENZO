import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { attachUser, requireAuth } from "../middleware/auth.js";
import { parseOrThrow } from "../utils/validation.js";

const router = Router();

const profileSchema = z.object({
  full_name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(20).optional(),
  default_city: z.string().trim().max(200).optional(),
  default_address: z.string().trim().max(500).optional(),
});

// CHECKPOINT NOTE (server/src/routes/account.js):
// A logged-in customer's own profile row (added by migration_v4.sql).
// req.user.id comes from a verified Supabase token, never from the
// request body, so a customer can only ever read/edit their own row.
router.get("/profile", attachUser, requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (error) throw error;
    res.json(data || { user_id: req.user.id });
  } catch (err) {
    next(err);
  }
});

router.put("/profile", attachUser, requireAuth, async (req, res, next) => {
  try {
    const body = parseOrThrow(profileSchema, req.body);
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .upsert({ user_id: req.user.id, ...body })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Is the signed-in user an admin? Checked with the service role, so it
// keeps working whatever Row Level Security policies admin_users has. The
// site uses this to decide whether to open /admin (AuthContext.jsx); the
// admin API itself is still protected by requireAdmin on every request.
router.get("/admin-status", attachUser, requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .select("user_id")
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (error) throw error;
    res.json({ isAdmin: !!data });
  } catch (err) {
    next(err);
  }
});

// Points balance + the latest 50 movements (earned, spent, taken back).
router.get("/points", attachUser, requireAuth, async (req, res, next) => {
  try {
    const [{ data: profile, error: pError }, { data: ledger, error: lError }] = await Promise.all([
      supabaseAdmin.from("profiles").select("points").eq("user_id", req.user.id).maybeSingle(),
      supabaseAdmin
        .from("points_ledger")
        .select("delta, reason, created_at, orders(order_number)")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (pError) throw pError;
    if (lError) throw lError;
    res.json({ balance: profile?.points ?? 0, history: ledger });
  } catch (err) {
    next(err);
  }
});

export default router;
