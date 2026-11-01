import { Router } from "express";
import { publicPaymentConfig } from "../lib/payments.js";

const router = Router();

// Public, read-only. Tells the storefront which payment methods to show and
// what the Reflect transfer details are. Nothing secret lives here -- the
// Reflect phone/name are things the customer is meant to see anyway.
router.get("/", (_req, res) => {
  res.json({ payments: publicPaymentConfig() });
});

export default router;
