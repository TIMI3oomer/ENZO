import { useTranslation } from "react-i18next";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useContent } from "../hooks/useContent.js";

// CHECKPOINT NOTE (components/WhatsAppButton.jsx):
// ACTION REQUIRED — replace the placeholder number below with your real
// WhatsApp business number in international format, no "+" or spaces
// (e.g. "970599123456"). Easiest way: set VITE_WHATSAPP_NUMBER in your
// .env instead of editing this file directly.
// Uses `inset-inline-end` (via Tailwind's `end-*`) so it sits at the
// bottom-right in LTR and bottom-LEFT in RTL automatically — correct
// placement in both directions, not a fixed corner.
const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || "970000000000";

export default function WhatsAppButton() {
  const { t } = useTranslation("common");
  const { lang } = useLanguage();
  // The number set in the CMS (site.store.whatsapp) wins over the build-time one.
  const number = (useContent("site").store?.whatsapp || "").replace(/\D/g, "") || WHATSAPP_NUMBER;

  const message = lang === "ar" ? "مرحباً ENZO، عندي سؤال بخصوص طلب" : "Hi ENZO, I have a question about an order";
  const href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("footer.whatsapp")}
      data-tour="whatsapp"
      className="fixed bottom-5 end-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-enzo-gradient text-enzo-black shadow-lg transition-transform hover:scale-105"
    >
      <svg viewBox="0 0 32 32" width="26" height="26" fill="currentColor" aria-hidden="true">
        <path d="M16.004 3C9.376 3 4 8.373 4 15c0 2.31.66 4.47 1.8 6.31L4 29l7.86-1.76A11.9 11.9 0 0 0 16.004 27C22.63 27 28 21.63 28 15S22.63 3 16.004 3Zm0 21.7c-1.95 0-3.77-.55-5.31-1.5l-.38-.22-4.66 1.04 1.04-4.55-.25-.4A9.6 9.6 0 0 1 6.3 15c0-5.36 4.36-9.7 9.7-9.7s9.7 4.34 9.7 9.7-4.34 9.7-9.7 9.7Zm5.32-7.27c-.29-.15-1.72-.85-1.99-.95-.27-.1-.46-.15-.66.15-.2.29-.76.95-.93 1.14-.17.2-.34.22-.63.07-.29-.15-1.23-.45-2.34-1.44-.87-.77-1.45-1.72-1.62-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.2-.29.29-.49.1-.2.05-.37-.02-.51-.07-.15-.66-1.6-.91-2.19-.24-.58-.48-.5-.66-.5h-.56c-.2 0-.51.07-.78.37-.27.29-1.02 1-1.02 2.43 0 1.43 1.04 2.82 1.19 3.01.15.2 2.05 3.13 4.97 4.39.69.3 1.23.48 1.65.61.69.22 1.32.19 1.82.11.55-.08 1.72-.7 1.96-1.38.24-.68.24-1.26.17-1.38-.07-.12-.26-.2-.55-.35Z" />
      </svg>
    </a>
  );
}
