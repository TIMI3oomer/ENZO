import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { COLOR_HEX } from "../lib/colors.js";

// CHECKPOINT NOTE (ProductCard.jsx):
// `text-start` (not text-left) so captions align correctly in both
// directions. The enzo-ring glow (defined in index.css) is the recurring
// brand signature reused here on hover instead of a generic shadow.
//
// COLOR SWATCH PREVIEW: if a product has 2+ colors AND the admin assigned
// photos to them (product.color_images, set in admin/ProductForm.jsx),
// small swatch dots appear over the image. Hovering (desktop) or tapping
// (mobile -- "click" fires on tap too) swaps the shown photo without
// leaving the grid. The swatches sit INSIDE the card's <Link> for layout
// reasons, so their clicks call preventDefault/stopPropagation to stop
// that click from also triggering navigation to the product page.
export default function ProductCard({ product }) {
  const { t } = useTranslation("common");
  const localize = useLocalizedField();
  const [previewColor, setPreviewColor] = useState(null);

  const colorImages = product.color_images || {};
  const hasColorPreviews = (product.colors?.length || 0) > 1 && Object.keys(colorImages).length > 0;
  const displayedImage = (previewColor && colorImages[previewColor]) || product.images?.[0];

  function handleSwatchClick(e, color) {
    e.preventDefault();
    e.stopPropagation();
    setPreviewColor((current) => (current === color ? null : color));
  }

  return (
    <Link to={`/product/${product.slug}`} className="group block">
      <div className="enzo-ring relative aspect-[3/4] overflow-hidden rounded-lg bg-enzo-panel">
        {displayedImage ? (
          <img
            src={displayedImage}
            alt={localize(product.name)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-enzo-muted">ENZO</div>
        )}

        {product.stock === 0 && (
          <span className="absolute top-3 start-3 rounded bg-enzo-black/80 px-2 py-1 text-xs">
            {t("product.outOfStock")}
          </span>
        )}

        {hasColorPreviews && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {product.colors.map((c) => (
              <button
                key={c}
                onMouseEnter={() => setPreviewColor(c)}
                onClick={(e) => handleSwatchClick(e, c)}
                title={c}
                className={`h-4 w-4 rounded-full border transition-transform ${
                  previewColor === c ? "scale-125 border-enzo-goldBright" : "border-white/60"
                }`}
                style={{ backgroundColor: COLOR_HEX[c] || "#333" }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 text-start">
        <p className="text-sm font-medium">{localize(product.name)}</p>
        <p className="text-sm text-enzo-muted">{product.price}</p>
      </div>
    </Link>
  );
}
