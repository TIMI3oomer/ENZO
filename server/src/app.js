import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import "dotenv/config";

import productsRoutes from "./routes/products.js";
import categoriesRoutes from "./routes/categories.js";
import ordersRoutes from "./routes/orders.js";
import adminRoutes from "./routes/admin.js";
import accountRoutes from "./routes/account.js";
import configRoutes from "./routes/config.js";
import contentRoutes from "./routes/content.js";
import webhooksRoutes from "./routes/webhooks.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();

// FIX: Vercel (and any reverse proxy) puts the real client IP in
// X-Forwarded-For. Without this, req.ip is the proxy's address, so
// express-rate-limit saw EVERY visitor as the same client -- 20 orders
// per 15 minutes for the whole store combined -- and logged
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR. "1" = trust exactly one proxy hop.
app.set("trust proxy", 1);

// CHECKPOINT NOTE (server/src/app.js):
// This file used to be index.js and called app.listen() directly. Split
// out so the same configured app can be used two ways:
//   - server/src/index.js: local development (calls app.listen())
//   - server/api/index.js: Vercel deployment (Vercel calls the exported
//     app itself as a serverless function -- it manages the actual
//     listening/port, so app.listen() would be wrong/unused there).
//
// - helmet() sets a batch of standard security headers (no X-Powered-By,
//   sensible defaults against clickjacking/sniffing, etc.).
// - cors() allows one or more comma-separated origins via FRONTEND_URL —
//   supports having both your production domain and a Vercel preview URL
//   allowed at once during testing. A script running on some other site
//   still cannot call this API from a browser.
// - express.json({ limit }) caps request body size so someone can't send
//   a huge payload to exhaust server memory.
// - orderLimiter throttles order creation specifically. NOTE: on Vercel,
//   each serverless invocation can run in a fresh instance, so this
//   in-memory rate limit is "best effort" there (it resets more often
//   than on a single long-running server) rather than a hard global
//   guarantee — acceptable for a small store, flagged honestly rather
//   than silently glossed over.
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim().replace(/^["']|["']$/g, "").replace(/\/$/, "")) // strip stray quotes and trailing slashes -- both are common copy-paste mistakes in env var values
  .map((s) => (/^https?:\/\//.test(s) ? s : `https://${s}`)); // and tolerate a bare domain with no scheme at all -- also common, and otherwise silently matches nothing, since a real browser Origin header always includes one

// Vercel gives every deployment of the frontend (each PR preview, and
// every new production deploy before a custom domain is attached) its own
// unique URL like `enzo-front-<hash>-<team>.vercel.app`, on top of the one
// stable domain configured in FRONTEND_URL -- a fresh, never-whitelisted
// origin every time. So alongside the exact FRONTEND_URL match, also
// allow same-project Vercel deployment URLs derived from it (e.g.
// `enzo-front.vercel.app` -> `enzo-front-*.vercel.app`), instead of
// silently blocking every preview build.
const vercelDeploymentPatterns = allowedOrigins
  .filter((o) => /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(o))
  .map((o) => {
    const slug = o.replace("https://", "").split(".")[0];
    return new RegExp(`^https:\\/\\/${slug}-[a-z0-9-]+\\.vercel\\.app$`);
  });

console.log("[ENZO server] CORS allowed origins:", allowedOrigins);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow no-origin requests (e.g. curl, server-to-server health checks)
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, "");
      const isAllowed =
        allowedOrigins.includes(normalized) || vercelDeploymentPatterns.some((re) => re.test(normalized));
      if (isAllowed) return callback(null, true);
      console.warn(`[ENZO server] Blocked CORS request from origin: ${origin}`);
      const err = new Error("Not allowed by CORS");
      err.status = 403; // not a server fault -- keep it out of the generic 500 bucket in logs/monitoring
      callback(err);
    },
  })
);

// CHECKPOINT NOTE: the Stripe webhook is mounted here, BEFORE
// express.json() below, because it needs the raw request body for
// signature verification (see webhooks.js's own comment for why). Every
// other route needs JSON parsing; this one specifically must not have it
// applied globally beforehand.
app.use("/api/webhooks", webhooksRoutes);

app.use(express.json({ limit: "100kb" }));
app.use(morgan("dev"));

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 order attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  // only throttle order creation -- not GET /orders/mine, and not the
  // checkout's price quote, which runs while the customer types a code
  skip: (req) => req.method !== "POST" || req.path === "/quote",
  message: { error: "Too many orders from this device recently, please try again later." },
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// REMOVED: /api/debug-cors. It was publicly reachable and echoed the raw
// FRONTEND_URL env var back to anyone. CORS origins are already logged
// once at startup (see console.log above) -- check the Vercel function
// logs instead of exposing configuration over HTTP.

// Public, read-only: which payment methods this store currently offers and
// the manual-transfer (Reflect) instructions. See routes/config.js.
app.use("/api/config", configRoutes);

app.use("/api/products", productsRoutes);
app.use("/api/categories", categoriesRoutes);
// Order tracking takes an order number + phone: limited so nobody can
// sit there guessing other customers' numbers.
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many tracking attempts, please try again later." },
});
app.use("/api/orders/track", trackLimiter);
app.use("/api/orders", orderLimiter, ordersRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/content", contentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
