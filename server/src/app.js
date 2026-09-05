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
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();

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
  .map((s) => s.trim().replace(/^["']|["']$/g, "").replace(/\/$/, "")); // strip stray quotes and trailing slashes -- both are common copy-paste mistakes in env var values

console.log("[ENZO server] CORS allowed origins:", allowedOrigins);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow no-origin requests (e.g. curl, server-to-server health checks)
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(normalized)) return callback(null, true);
      console.warn(`[ENZO server] Blocked CORS request from origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json({ limit: "100kb" }));
app.use(morgan("dev"));

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 order attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== "POST", // only throttle order creation, not GET /orders/mine
  message: { error: "Too many orders from this device recently, please try again later." },
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/debug-cors",(_req,res) =>{
  res.json({
    rawFrontendUrlEnvVar: process.env.FRONTEND_URL ?? null,
    parsedAllowedOrigins: allowedOrigins,
  });
});

app.use("/api/products", productsRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/orders", orderLimiter, ordersRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/account", accountRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
