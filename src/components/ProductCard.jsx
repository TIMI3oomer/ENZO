import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { useSettings } from "../context/SettingsContext.jsx";
import { formatPrice } from "../lib/formatPrice.js";
import { COLOR_HEX } from "../lib/colors.js";

// CHECKPOINT NOTE (ProductCard.jsx):
// `text-start` (not text-left) so captions align correctly in both
// directions. Previously the ring glow (`.enzo-ring`, defined in
// index.css) sat directly on the image with no real card shell around
// it -- just a photo floating over a caption. It's now wrapped in an
// actual bordered/elevated panel (image + footer in one rounded-2xl
// shell) so the grid reads as a set of cards, not a loose photo grid.
// `.enzo-ring-card` is a rectangular variant of that same glow (see
// index.css) sized to this shell's corners instead of the pill-shaped
// original, which is kept as-is for the circular/avatar use elsewhere.
//
// COLOR SWATCH PREVIEW: if a product has 2+ colors AND the admin assigned
// photos to them (product.color_images, set in admin/ProductForm.jsx),
// swatch chips appear over the image. Hovering (desktop) or tapping
// (mobile -- "click" fires on tap too) swaps the shown photo without
// leaving the grid. Chips sit on a translucent bar (not bare dots on the
// photo) so they stay legible over any image, and are sized a bit larger
// than before since most shoppers here are on mobile tapping, not
// hovering with a precise cursor. The swatches sit INSIDE the card's
// <Link> for layout reasons, so their clicks call
// preventDefault/stopPropagation to stop that click from also triggering
// navigation to the product page.
export default function ProductCard({ product }) {
  const { t } = useTranslation("common");
  const localize = useLocalizedField();
  const { currency_symbol } = useSettings();
  const [previewColor, setPreviewColor] = useState(null);

  const colorImages = product.color_images || {};
  const hasColorPreviews = (product.colors?.length || 0) > 1 && Object.keys(colorImages).length > 0;
  const displayedImage = (previewColor && colorImages[previewColor]) || product.images?.[0];
  const name = localize(product.name);

  function handleSwatchClick(e, color) {
    e.preventDefault();
    e.stopPropagation();
    setPreviewColor((current) => (current === color ? null : color));
  }

  return (
    <Link to={`/product/${product.slug}`} className="group block h-full">
      <div className="enzo-ring-card flex h-full flex-col overflow-hidden rounded-2xl border border-enzo-line/60 bg-enzo-panel transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:border-enzo-gold/50 group-hover:shadow-[0_18px_36px_-18px_rgba(201,162,39,0.4)] group-active:translate-y-0 group-active:scale-[0.98]">
        <div className="relative aspect-[3/4] overflow-hidden bg-enzo-black/40">
          {displayedImage ? (
            <img
              src={displayedImage}
              alt={name}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center font-display text-lg tracking-wide text-enzo-muted">
              ENZO
            </div>
          )}

          {product.stock === 0 && (
            <span className="absolute top-2.5 start-2.5 rounded-full border border-white/10 bg-enzo-black/80 px-2.5 py-1 text-[11px] uppercase tracking-wide text-enzo-white backdrop-blur-sm">
              {t("product.outOfStock")}
            </span>
          )}

          {hasColorPreviews && (
            <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2.5">
              <div className="flex items-center gap-1.5 rounded-full bg-enzo-black/45 px-2 py-1.5 backdrop-blur-sm">
                {product.colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onMouseEnter={() => setPreviewColor(c)}
                    onClick={(e) => handleSwatchClick(e, c)}
                    title={c}
                    aria-label={c}
                    aria-pressed={previewColor === c}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-transform"
                  >
                    <span
                      className={`h-3.5 w-3.5 rounded-full border transition-transform ${
                        previewColor === c
                          ? "scale-110 border-enzo-goldBright ring-1 ring-enzo-goldBright"
                          : "border-white/50"
                      }`}
                      style={{ backgroundColor: COLOR_HEX[c] || "#333" }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 px-3 py-3 text-start">
          <p className="line-clamp-1 text-sm font-medium">{name}</p>
          <p className="mt-auto text-sm font-semibold text-enzo-goldBright">{formatPrice(product.price, currency_symbol)}</p>
        </div>
      </div>
    </Link>
  );
}
