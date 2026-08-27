import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Static imports of every namespace, for both languages.
// This keeps the bundle simple (no async loading flicker) which matters
// for a site that must never show a flash of untranslated text.
import arCommon from "./locales/ar/common.json";
import arCheckout from "./locales/ar/checkout.json";
import arAdmin from "./locales/ar/admin.json";
import enCommon from "./locales/en/common.json";
import enCheckout from "./locales/en/checkout.json";
import enAdmin from "./locales/en/admin.json";

// CHECKPOINT NOTE:
// This is the single translation registry for the whole site.
// - "common" = navbar, buttons, generic UI, product labels
// - "checkout" = checkout + order confirmation copy
// - "admin" = admin dashboard copy
// Add new keys here, never hardcode Arabic/English text inside components.
i18n.use(initReactI18next).init({
  resources: {
    ar: { common: arCommon, checkout: arCheckout, admin: arAdmin },
    en: { common: enCommon, checkout: enCheckout, admin: enAdmin },
  },
  lng: localStorage.getItem("enzo_lang") || "ar", // Arabic is the default language
  fallbackLng: "ar",
  ns: ["common", "checkout", "admin"],
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

export default i18n;
