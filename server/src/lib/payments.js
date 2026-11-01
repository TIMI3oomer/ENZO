import "dotenv/config";

// CHECKPOINT NOTE (server/src/lib/payments.js):
// Single place that decides which payment methods the store offers.
//
// WHY THIS EXISTS: Stripe does not support businesses located in Palestine,
// so a store run from the West Bank usually cannot take Stripe card payments
// at all. Instead of hard-wiring card checkout (which then fails at the last
// step for every customer), card payment is OFF unless you explicitly turn it
// on with CARD_PROVIDER=stripe -- e.g. if you hold a Stripe account that
// works for you. The store then runs on:
//   - "cod"     cash on delivery (always on)
//   - "reflect" manual transfer to your Reflect wallet; the customer is
//               shown your Reflect details after ordering and you mark the
//               order as paid in the admin panel once the money arrives
//   - "visa"    card payments, only when a card provider is configured
//
// When you get a local card gateway (Bank of Palestine, PalPay, PayTabs/MEPS
// ...), add its provider next to "stripe" here and in routes/orders.js.

export function cardProvider() {
  const p = (process.env.CARD_PROVIDER || "none").trim().toLowerCase();
  if (p === "stripe" && process.env.STRIPE_SECRET_KEY) return "stripe";
  return "none";
}

export function cardEnabled() {
  return cardProvider() !== "none";
}

export function reflectConfig() {
  const phone = (process.env.REFLECT_PHONE || "").trim();
  const accountName = (process.env.REFLECT_ACCOUNT_NAME || "").trim();
  return { enabled: Boolean(phone), phone, accountName };
}

export function publicPaymentConfig() {
  return {
    cod: true,
    card: cardEnabled(),
    reflect: reflectConfig(),
  };
}
