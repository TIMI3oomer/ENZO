import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedField } from "../context/LanguageContext.jsx";

// CHECKPOINT NOTE (ProductCard.jsx):
// `text-start` (not text-left) so captions align correctly in both
// directions. The enzo-ring glow (defined in index.css) is the recurring
// brand signature reused here on hover instead of a generic shadow.
export default function ProductCard({ product }) {
  const { t } = useTranslation("common");
  const localize = useLocalizedField();

  return (
    <Link to={`/product/${product.slug}`} className="group block">
      <div className="enzo-ring relative aspect-[3/4] overflow-hidden rounded-lg bg-enzo-panel">
        {product.images?.[0] ? (
          <img
            src={product.images[0]}
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
      </div>
      <div className="mt-3 text-start">
        <p className="text-sm font-medium">{localize(product.name)}</p>
        <p className="text-sm text-enzo-muted">{product.price}</p>
      </div>
    </Link>
  );
}
