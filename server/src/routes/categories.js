import { Router } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

const router = Router();

// Public, read-only — same category list everyone sees, in both languages
// (the client picks which key to render, see useLocalizedField on the frontend).
router.get("/", async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from("categories").select("*").order("created_at");
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
