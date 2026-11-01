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
// as a text input/textarea in the dashboard editor; `type: "image"`
// renders as an image upload (content-images bucket) and stores the
// public URL as the value.
export const SCALAR_FIELDS = [
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
