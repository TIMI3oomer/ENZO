import { Resend } from "resend";
import "dotenv/config";

// CHECKPOINT NOTE (server/src/lib/email.js):
// Uses the Resend API (resend.com) instead of raw SMTP -- a single API
// key, no mailbox/app-password to configure, and no risk of a serverless
// function's outbound SMTP connection (port 587/465) being slow or
// blocked on Vercel. Sign up at resend.com, create an API key, and verify
// a sending domain (Resend's own onboarding walks through the DNS
// records) -- or use their onboarding@resend.dev sender for testing with
// no domain at all, limited to sending to your own Resend account email.
//
// If RESEND_API_KEY isn't set, sendOrderStatusEmail() just logs to the
// console instead of throwing -- so the rest of the order-status-update
// flow keeps working even before you've configured a real sender.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Kept as a plain constant (not admin-editable) now that store_settings
// is gone -- this is a single-currency store, so there's nothing to
// configure here.
const CURRENCY_SYMBOL = "₪";
function formatMoney(amount) {
  return `${(Number(amount) || 0).toLocaleString()} ${CURRENCY_SYMBOL}`;
}

// The admin's free-text note goes into the HTML email; escape it so stray
// "<" or "&" characters can't break (or inject into) the markup.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STATUS_LABELS = {
  pending: { ar: "قيد المراجعة", en: "Pending" },
  confirmed: { ar: "مؤكد", en: "Confirmed" },
  shipped: { ar: "تم الشحن", en: "Shipped" },
  delivered: { ar: "تم التسليم", en: "Delivered" },
  cancelled: { ar: "ملغي", en: "Cancelled" },
};

function buildEmail({ orderNumber, status, note, locale }) {
  const isAr = locale === "ar";
  const statusLabel = STATUS_LABELS[status]?.[locale] || status;

  const subject = isAr ? `تحديث حالة طلبك #${orderNumber} — ENZO` : `Your order #${orderNumber} status update — ENZO`;

  const greeting = isAr ? "مرحباً," : "Hello,";
  const intro = isAr
    ? `تم تحديث حالة طلبك رقم #${orderNumber} إلى:`
    : `Your order #${orderNumber} status has been updated to:`;
  const noteLabel = isAr ? "ملاحظة من فريق ENZO:" : "Note from the ENZO team:";
  const signOff = isAr ? "شكراً لتسوقك من ENZO" : "Thank you for shopping with ENZO";

  const text = [
    greeting,
    "",
    intro,
    statusLabel.toUpperCase(),
    ...(note ? ["", noteLabel, note] : []),
    "",
    signOff,
  ].join("\n");

  const html = `
    <div style="font-family:sans-serif;background:#0A0A0A;color:#F5F5F2;padding:32px;direction:${isAr ? "rtl" : "ltr"};text-align:${isAr ? "right" : "left"}">
      <h2 style="margin:0 0 16px;">ENZO</h2>
      <p>${greeting}</p>
      <p>${intro}</p>
      <p style="font-size:20px;font-weight:bold;color:#C9A227;">${statusLabel}</p>
      ${note ? `<p style="margin-top:16px;color:#9A9A94;">${noteLabel}</p><p>${escapeHtml(note)}</p>` : ""}
      <p style="margin-top:32px;color:#9A9A94;">${signOff}</p>
    </div>
  `;

  return { subject, text, html };
}

export async function sendOrderStatusEmail({ to, orderNumber, status, note, locale = "ar" }) {
  if (!to) return; // guest checkout with no email provided -- nothing to send
  const { subject, text, html } = buildEmail({ orderNumber, status, note, locale });
  await dispatch(to, subject, text, html);
}

// CHECKPOINT NOTE (sendOrderTotalEmail):
// Delivery fee varies by city, so it's never charged/guessed at
// checkout -- the customer's total isn't actually final until the admin
// sets the real delivery fee for their order (see PATCH
// /api/admin/orders/:id/delivery-fee in routes/admin.js). THIS is the
// email that goes out at that moment: subtotal + the now-confirmed
// delivery fee + the resulting final total, so the customer knows
// exactly what to have ready (this store is mostly cash-on-delivery).
function buildTotalEmail({ orderNumber, subtotal, deliveryFee, total, locale }) {
  const isAr = locale === "ar";

  const subject = isAr
    ? `السعر النهائي لطلبك #${orderNumber} — ENZO`
    : `Your order #${orderNumber} — final price — ENZO`;

  const greeting = isAr ? "مرحباً," : "Hello,";
  const intro = isAr
    ? `تم تأكيد رسوم التوصيل لطلبك رقم #${orderNumber}. هذا هو السعر النهائي:`
    : `Delivery has been confirmed for your order #${orderNumber}. Here's your final price:`;
  const subtotalLabel = isAr ? "المجموع الفرعي" : "Subtotal";
  const deliveryLabel = isAr ? "رسوم التوصيل" : "Delivery fee";
  const totalLabel = isAr ? "السعر النهائي" : "Final total";
  const signOff = isAr ? "شكراً لتسوقك من ENZO" : "Thank you for shopping with ENZO";

  const text = [
    greeting,
    "",
    intro,
    `${subtotalLabel}: ${formatMoney(subtotal)}`,
    `${deliveryLabel}: ${formatMoney(deliveryFee)}`,
    `${totalLabel}: ${formatMoney(total)}`,
    "",
    signOff,
  ].join("\n");

  const html = `
    <div style="font-family:sans-serif;background:#0A0A0A;color:#F5F5F2;padding:32px;direction:${isAr ? "rtl" : "ltr"};text-align:${isAr ? "right" : "left"}">
      <h2 style="margin:0 0 16px;">ENZO</h2>
      <p>${greeting}</p>
      <p>${intro}</p>
      <table style="width:100%;max-width:360px;margin-top:16px;color:#9A9A94;">
        <tr><td>${subtotalLabel}</td><td style="text-align:${isAr ? "left" : "right"}">${formatMoney(subtotal)}</td></tr>
        <tr><td>${deliveryLabel}</td><td style="text-align:${isAr ? "left" : "right"}">${formatMoney(deliveryFee)}</td></tr>
      </table>
      <p style="margin-top:16px;font-size:20px;font-weight:bold;color:#C9A227;">${totalLabel}: ${formatMoney(total)}</p>
      <p style="margin-top:32px;color:#9A9A94;">${signOff}</p>
    </div>
  `;

  return { subject, text, html };
}

export async function sendOrderTotalEmail({ to, orderNumber, subtotal, deliveryFee, total, locale = "ar" }) {
  if (!to) return; // guest checkout with no email provided -- nothing to send
  const { subject, text, html } = buildTotalEmail({ orderNumber, subtotal, deliveryFee, total, locale });
  await dispatch(to, subject, text, html);
}

async function dispatch(to, subject, text, html) {
  if (!resend) {
    console.log(`[ENZO email — NOT SENT, no RESEND_API_KEY configured] To: ${to} | ${subject}`);
    return;
  }

  try {
    // EMAIL_FROM must be an address at a domain verified in Resend (or
    // the "onboarding@resend.dev" test sender) -- an unverified from
    // address is rejected by Resend itself, caught below same as any
    // other send failure.
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "ENZO <onboarding@resend.dev>",
      to,
      subject,
      text,
      html,
    });
    if (error) throw error;
  } catch (err) {
    // A failed email should never block the action that triggered it
    // (an order-status update, or the admin confirming a delivery fee).
    console.error("[ENZO email] Failed to send:", err.message || err);
  }
}
