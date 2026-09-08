import app from "../src/app.js";

// CHECKPOINT NOTE (server/api/index.js):
// Vercel's Node.js runtime treats any file in /api as a serverless
// function. An Express app is itself a valid request handler function
// `(req, res) => {}`, so exporting it directly here is all Vercel needs —
// no adapter/wrapper library required. Routed to by server/vercel.json's
// rewrite rule (every request goes through this one function).
//
// REVERTED from the `/api/[...path].js` catch-all convention: that
// approach silently failed to route any MULTI-segment path under /api/*
// (e.g. /api/products/:slug, /api/admin/products) — those requests never
// even reached this function, with zero trace in Vercel's logs, while
// single-segment paths (/api/products, /api/categories) worked fine.
// Confirmed across multiple separate deployments before reverting. The
// explicit rewrite below is more verbose (and re-triggers a cosmetic
// Vercel build warning about relying on rewrites), but it actually routes
// every path correctly, which the catch-all did not.
export default app;
