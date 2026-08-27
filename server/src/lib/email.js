import nodemailer from "nodemailer";
import "dotenv/config";

// CHECKPOINT NOTE (server/src/lib/email.js):
// Uses SMTP via nodemailer -- works with a real "enzo@yourdomain.com"
// mailbox (ask your domain/host provider for its SMTP settings) or, for
// testing, a Gmail account with an "App Password" (Google Account ->
// Security -> 2-Step Verification -> App Passwords; a normal Gmail
// password will NOT work here).
//
// If EMAIL_HOST/EMAIL_USER/EMAIL_PASS aren't set, sendOrderStatusEmail()
// just logs to the console instead of throwing -- so the rest of the
// order-status-update flow keeps working even before you've configured a
// real mailbox.
const hasEmailConfig = process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS;

const transporter = hasEmailConfig
  ? nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: Number(process.env.EMAIL_PORT) === 465,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    })
  : null;

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
      ${note ? `<p style="margin-top:16px;color:#9A9A94;">${noteLabel}</p><p>${note}</p>` : ""}
      <p style="margin-top:32px;color:#9A9A94;">${signOff}</p>
    </div>
  `;

  return { subject, text, html };
}

export async function sendOrderStatusEmail({ to, orderNumber, status, note, locale = "ar" }) {
  if (!to) return; // guest checkout with no email provided -- nothing to send
  const { subject, text, html } = buildEmail({ orderNumber, status, note, locale });

  if (!transporter) {
    console.log(`[ENZO email — NOT SENT, no SMTP configured] To: ${to} | ${subject}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `ENZO <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    // A failed email should never block the order-status update itself.
    console.error("[ENZO email] Failed to send:", err.message);
  }
}
