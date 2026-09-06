// CHECKPOINT NOTE (src/lib/colors.js):
// Single source of truth for the preset color palette — used by
// admin/ProductForm.jsx (the color picker), ProductDetail.jsx, and
// ProductCard.jsx (swatch previews). Add a color here once and it's
// available everywhere automatically, with the admin picker and the
// storefront display always agreeing on what hex a color name means.
export const PRESET_COLORS = [
  { name: "Black", hex: "#0A0A0A" },
  { name: "White", hex: "#FAFAF7" },
  { name: "Gold", hex: "#C9A227" },
  { name: "Gray", hex: "#6B6B6B" },
  { name: "Navy", hex: "#1F2A44" },
  { name: "Beige", hex: "#D8C3A5" },
  { name: "Red", hex: "#B3312C" },
  { name: "Green", hex: "#3C6B4A" },
  { name: "Blue", hex: "#2A5CAA" },
  { name: "Yellow", hex: "#E8B923" },
  { name: "Orange", hex: "#D9702E" },
];

export const COLOR_HEX = Object.fromEntries(PRESET_COLORS.map((c) => [c.name, c.hex]));
