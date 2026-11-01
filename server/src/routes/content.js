import { Router } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

const router = Router();

// Public, read-only — raw CMS rows for one page (see
// supabase/migration_v12.sql). The frontend merges these over its own
// hardcoded defaults (src/lib/contentManifest.js), so a missing row or an
// empty table never breaks the storefront -- it just shows the default.
router.get("/:page", async (req, res, next) => {
  try {
    const { page } = req.params;
    const [itemsRes, collectionsRes] = await Promise.all([
      supabaseAdmin.from("content_items").select("section, key, value").eq("page", page),
      supabaseAdmin
        .from("content_collections")
        .select("section, sort_order, data")
        .eq("page", page)
        .order("sort_order", { ascending: true }),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (collectionsRes.error) throw collectionsRes.error;
    res.json({ items: itemsRes.data || [], collections: collectionsRes.data || [] });
  } catch (err) {
    next(err);
  }
});

export default router;
