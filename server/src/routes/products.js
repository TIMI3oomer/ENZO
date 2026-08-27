import { Router } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

const router = Router();

// CHECKPOINT NOTE (server/src/routes/products.js):
// Public, read-only. Uses the service_role client but manually filters
// `is_active = true` itself (since service_role bypasses RLS) — the
// backend re-implements that safety check explicitly rather than relying
// on a policy it just bypassed.
router.get("/", async (req, res, next) => {
  try {
    const { category, size, sort } = req.query;
    let query = supabaseAdmin.from("products").select("*").eq("is_active", true);

    if (category) {
      const { data: cat } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("slug", category)
        .maybeSingle();
      if (!cat) return res.json([]);
      query = query.eq("category_id", cat.id);
    }

    if (size) query = query.contains("sizes", [size]);

    if (sort === "price_asc") query = query.order("price", { ascending: true });
    else if (sort === "price_desc") query = query.order("price", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get("/:slug", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("slug", req.params.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Product not found" });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
