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

// CHECKPOINT NOTE (server/src/index.js):
// - helmet() sets a batch of standard security headers (no X-Powered-By,
//   sensible defaults against clickjacking/sniffing, etc.).
// - cors() is locked to FRONTEND_URL only — a script running on some other
//   site cannot call this API from a browser.
// - express.json({ limit }) caps request body size so someone can't send
//   a huge payload to exhaust server memory.
// - orderLimiter throttles order creation specifically (the endpoint most
//   worth protecting from abuse/spam) without slowing down normal Browse.
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
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

app.use("/api/products", productsRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/orders", orderLimiter, ordersRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/account", accountRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`[ENZO server] listening on port ${port}`));
