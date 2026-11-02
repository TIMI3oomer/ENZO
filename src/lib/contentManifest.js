// Manifest for the small CMS added on top of content_items /
// content_collections (supabase/migration_v12.sql). Built from what's
// ACTUALLY editable in this codebase today -- not placeholder/example
// content from the spec this was ported from.
//
// Per the user's choice when this was set up: these fields are plain
// single-language text. When the admin hasn't set a value, the site falls
// back to the existing bilingual i18n string (defaultT below) so nothing
// breaks and nothing looks empty on day one; once the admin saves a value,
// that literal text is shown in BOTH languages (it replaces the i18n pair,
// it doesn't translate it).
//
// SCALAR_FIELDS: one row per (page, section, key). `type: "text"` renders
// as a text input/textarea in the dashboard editor; `type: "toggle"`
// renders as an on/off switch stored as "on" / "off"; `type: "image"`
// renders as an image upload (content-images bucket) and stores the
// public URL as the value.
export const SCALAR_FIELDS = [
  {
    page: "home",
    section: "sections",
    key: "showPromo",
    type: "toggle",
    label: "Show: Promo strip",
    defaultT: () => "on",
  },
  {
    page: "home",
    section: "sections",
    key: "showNewArrivals",
    type: "toggle",
    label: "Show: New arrivals",
    defaultT: () => "on",
  },
  {
    page: "home",
    section: "sections",
    key: "showCategories",
    type: "toggle",
    label: "Show: Category photo tiles",
    defaultT: () => "on",
  },
  {
    page: "home",
    section: "sections",
    key: "showEditorial",
    type: "toggle",
    label: "Show: Campaign banner",
    defaultT: () => "on",
  },
  {
    page: "home",
    section: "sections",
    key: "showSale",
    type: "toggle",
    label: "Show: On sale",
    defaultT: () => "on",
  },
  {
    page: "home",
    section: "sections",
    key: "showCategoryRails",
    type: "toggle",
    label: "Show: A row for each category",
    defaultT: () => "on",
  },
  {
    page: "home",
    section: "sections",
    key: "showBrandStrip",
    type: "toggle",
    label: "Show: Big scrolling ENZO strip",
    defaultT: () => "on",
  },
  {
    page: "home",
    section: "sections",
    key: "showPoints",
    type: "toggle",
    label: "Show: Points banner",
    defaultT: () => "on",
  },
  {
    page: "home",
    section: "sections",
    key: "showTrust",
    type: "toggle",
    label: "Show: Trust badges",
    defaultT: () => "on",
  },
  {
    page: "home",
    section: "hero",
    key: "title",
    type: "text",
    label: "Hero heading",
    defaultT: (t) => t("hero.title", { ns: "common" }),
  },
  {
    page: "home",
    section: "hero",
    key: "subtitle",
    type: "text",
    label: "Hero subtitle",
    defaultT: (t) => t("hero.subtitle", { ns: "common" }),
  },
  {
    page: "home",
    section: "hero",
    key: "cta",
    type: "text",
    label: "Hero button text",
    defaultT: (t) => t("hero.cta", { ns: "common" }),
  },
  {
    page: "home",
    section: "hero",
    key: "image1",
    type: "image",
    label: "Banner slide 1 (wide photo, ~1920x900)",
    defaultT: () => "",
  },
  {
    page: "home",
    section: "hero",
    key: "image2",
    type: "image",
    label: "Banner slide 2",
    defaultT: () => "",
  },
  {
    page: "home",
    section: "hero",
    key: "image3",
    type: "image",
    label: "Banner slide 3",
    defaultT: () => "",
  },
  {
    page: "home",
    section: "promo",
    key: "text",
    type: "text",
    label: "Promo strip under the banner",
    defaultT: (t) => t("home.promo", { ns: "common" }),
  },
  {
    page: "home",
    section: "editorial",
    key: "image",
    type: "image",
    label: "Campaign banner photo",
    defaultT: () => "",
  },
  {
    page: "home",
    section: "editorial",
    key: "title",
    type: "text",
    label: "Campaign banner heading",
    defaultT: (t) => t("home.editorialTitle", { ns: "common" }),
  },
  {
    page: "home",
    section: "editorial",
    key: "text",
    type: "text",
    label: "Campaign banner text",
    defaultT: (t) => t("home.editorialText", { ns: "common" }),
  },
  {
    page: "home",
    section: "editorial",
    key: "cta",
    type: "text",
    label: "Campaign banner button",
    defaultT: (t) => t("home.editorialCta", { ns: "common" }),
  },
  {
    page: "site",
    section: "announcement",
    key: "text",
    type: "text",
    label: "Announcement bar (top of every page)",
    defaultT: (t) => t("home.announcement", { ns: "common" }),
  },
  {
    page: "site",
    section: "footer",
    key: "tagline",
    type: "text",
    label: "Footer about text",
    defaultT: (t) => t("footer.tagline", { ns: "common" }),
  },
  {
    page: "site",
    section: "footer",
    key: "contactHandle",
    type: "text",
    label: "Footer contact handle",
    defaultT: () => "enzo.m.w1",
  },
  {
    page: "site",
    section: "images",
    key: "logo",
    type: "image",
    label: "Site logo (navbar, footer, home)",
    defaultT: () => "/logo.jpg",
  },
  {
    page: "site",
    section: "product",
    key: "careInstructions",
    type: "text",
    label: "Care instructions (shown on every product page)",
    defaultT: () => "اغسل بماء بارد، لا تستخدم المبيض، جفف بالهواء، كوي على حرارة منخفضة.",
  },
  {
    page: "site",
    section: "store",
    key: "name",
    type: "text",
    label: "Store name (invoices)",
    defaultT: () => "ENZO",
  },
  {
    page: "site",
    section: "store",
    key: "phone",
    type: "text",
    label: "Phone number",
    defaultT: () => "",
  },
  {
    page: "site",
    section: "store",
    key: "whatsapp",
    type: "text",
    label: "WhatsApp number (international, digits only, e.g. 970599123456)",
    defaultT: () => "",
  },
  {
    page: "site",
    section: "store",
    key: "instagram",
    type: "text",
    label: "Instagram username",
    defaultT: () => "",
  },
  {
    page: "site",
    section: "store",
    key: "address",
    type: "text",
    label: "Shop address",
    defaultT: () => "",
  },
  {
    page: "site",
    section: "store",
    key: "invoiceNote",
    type: "text",
    label: "Note printed at the bottom of invoices",
    defaultT: (t) => t("invoice.thanks", { ns: "admin" }),
  },
  {
    page: "site",
    section: "store",
    key: "deliveryDays",
    type: "text",
    label: "Delivery time in days, shown to customers (e.g. 1-3)",
    defaultT: () => "1-3",
  },
  {
    page: "site",
    section: "store",
    key: "invoicePolicy",
    type: "text",
    label: "Return policy printed on invoices only (type - to hide it)",
    defaultT: (t) => t("invoice.policy", { ns: "admin" }),
  },
  {
    page: "site",
    section: "catalog",
    key: "showSoldOut",
    type: "toggle",
    label: "Show sold-out products (at the end of each list)",
    defaultT: () => "on",
  },
];

// No ordered-list content exists in this codebase yet (e.g. footer social
// links) -- left empty rather than inventing placeholder sections. Add
// entries here (and build a matching editor block in admin/Content.jsx)
// the day a real one is needed.
export const COLLECTION_SECTIONS = [];

export const CMS_PAGES = [...new Set(SCALAR_FIELDS.map((f) => f.page))];

// Shared by the public loader (useContent.js) and the admin editor
// (admin/Content.jsx): the manifest's hardcoded defaults for one page, as
// a flat `{ [section]: { [key]: value } }` map.
export function defaultsFor(page, t) {
  const result = {};
  for (const field of SCALAR_FIELDS) {
    if (field.page !== page) continue;
    result[field.section] = result[field.section] || {};
    result[field.section][field.key] = field.defaultT(t);
  }
  return result;
}
