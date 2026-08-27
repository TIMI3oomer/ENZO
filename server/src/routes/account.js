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

export default router;
