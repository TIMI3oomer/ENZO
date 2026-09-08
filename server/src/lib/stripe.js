import Stripe from "stripe";
import "dotenv/config";

// CHECKPOINT NOTE (server/src/lib/stripe.js):
// ACTION REQUIRED — set STRIPE_SECRET_KEY in your backend's environment
// variables (Vercel project settings, or server/.env locally). Get this
// from your Stripe Dashboard -> Developers -> API keys -> "Secret key".
// Use a TEST mode key (starts with sk_test_) while developing, switch to
// a LIVE key (sk_live_) only once you're ready to accept real payments.
//
// This key must NEVER be in the frontend — it can create charges and
// refunds on your behalf. Only this backend file ever touches it.
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[ENZO server] STRIPE_SECRET_KEY is not set — card payments will fail until it's configured.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2024-06-20",
});
