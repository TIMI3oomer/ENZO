import app from "../src/app.js";

// CHECKPOINT NOTE (server/api/[...path].js):
// Renamed from api/index.js per Vercel's warning about relying on a
// vercel.json rewrite to route every request to one function -- that
// approach's behavior changed and Vercel now flags it for review.
//
// `[...path]` is Vercel's own catch-all filename convention (the same
// syntax Next.js uses for catch-all API routes, but it works for any
// Vercel Node.js function, not just Next.js projects): a file named
// exactly this way natively handles every request under /api/* without
// needing any rewrite rule at all. Since our frontend always calls
// paths like /api/products, /api/orders, etc., this covers everything
// we need with zero extra config -- and it's the officially supported
// mechanism, not something Vercel might change again.
export default app;
