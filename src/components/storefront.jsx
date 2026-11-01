import { useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage, useLocalizedField } from "../context/LanguageContext.jsx";
import ProductCard from "./ProductCard.jsx";
import Reveal from "./Reveal.jsx";

// CHECKPOINT NOTE (components/storefront.jsx):
// Small building blocks for the home page layout (modelled on a classic
// streetwear-store layout: marquee strips, "— TITLE —" section headings,
// arrow-driven product rails and big photo category tiles). Kept in one
// file because each piece is tiny and only makes sense next to the others.

// Endless scrolling strip of text (announcement bar / promo strip). The
// track is forced LTR so the translateX(-50%) loop works the same in
// Arabic; the text itself still renders right-to-left.
export function MarqueeStrip({ text, className = "" }) {
  if (!text) return null;
  const items = Array.from({ length: 8 }, (_, i) => i);
  return (
    <div className={`overflow-hidden whitespace-nowrap ${className}`} dir="ltr">
      <div className="flex w-max animate-[enzo-marquee_40s_linear_infinite] motion-reduce:animate-none">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
            {items.map((i) => (
              <span key={i} className="flex items-center gap-6 px-6">
                <span>{text}</span>
                <span className="h-1 w-1 rounded-full bg-current opacity-60" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Centered heading between two hairlines.
export function SectionTitle({ children, to, linkLabel }) {
  return (
    <Reveal className="mx-auto flex max-w-7xl items-center gap-4 px-4 pb-6 pt-14 sm:px-6">
      <span className="h-px flex-1 bg-enzo-line" />
      <h2 className="font-display text-xl uppercase tracking-[0.12em] sm:text-2xl">{children}</h2>
      <span className="h-px flex-1 bg-enzo-line" />
      {to && (
        <Link to={to} className="text-xs font-medium uppercase tracking-wider text-enzo-gold hover:text-enzo-goldBright">
          {linkLabel}
        </Link>
      )}
    </Reveal>
  );
}

// Horizontal product carousel: swipe on phones, arrow buttons on larger
// screens. 2 cards visible on a phone, 3 on tablet, 5 on desktop.
export function ProductRail({ products }) {
  const ref = useRef(null);
  const { isRtl } = useLanguage();
  if (!products?.length) return null;

  // In RTL "next" is to the left, so the scroll direction flips.
  const scroll = (dir) => {
    const el = ref.current;
    el?.scrollBy({ left: dir * el.clientWidth * 0.9 * (isRtl ? -1 : 1), behavior: "smooth" });
  };

  const arrow =
    "absolute top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-enzo-line bg-enzo-black/80 text-enzo-white backdrop-blur transition-colors hover:border-enzo-gold hover:text-enzo-goldBright sm:flex";

  return (
    <div className="relative mx-auto max-w-7xl sm:px-6">
      <button type="button" onClick={() => scroll(-1)} className={`${arrow} start-1 sm:start-2`} aria-label="previous">
        <ChevronLeft size={20} className="rtl:rotate-180" />
      </button>
      <div
        ref={ref}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [&::-webkit-scrollbar]:hidden sm:gap-4 sm:scroll-px-0 sm:px-0"
        style={{ scrollbarWidth: "none" }}
      >
        {products.map((p) => (
          <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-4rem)/5)]">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
      <button type="button" onClick={() => scroll(1)} className={`${arrow} end-1 sm:end-2`} aria-label="next">
        <ChevronRight size={20} className="rtl:rotate-180" />
      </button>
    </div>
  );
}

// Big photo tiles linking to a category, label in the bottom corner.
// The photo is the first product photo in that category.
export function CategoryTiles({ categories, products }) {
  const localize = useLocalizedField();
  if (!categories?.length) return null;

  // 1 or 2 categories fill the row with wider tiles instead of leaving gaps.
  const cols = ["grid-cols-1", "grid-cols-2", "grid-cols-3"][Math.min(categories.length, 3) - 1];
  const aspect = categories.length === 1 ? "aspect-[4/3] sm:aspect-[21/9]" : categories.length === 2 ? "aspect-[4/5]" : "aspect-[3/4]";

  return (
    <div className={`mx-auto grid max-w-7xl gap-2 px-4 pt-10 sm:gap-4 sm:px-6 ${cols}`}>
      {categories.map((c) => {
        const image = products.find((p) => p.category_id === c.id && p.images?.[0])?.images[0];
        return (
          <Link key={c.id} to={`/shop/${c.slug}`} className={`group relative block overflow-hidden bg-enzo-panel ${aspect}`}>
            {image ? (
              <img
                src={image}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,rgba(201,162,39,0.18),transparent_60%)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
            <span className="absolute bottom-3 start-3 font-display text-lg uppercase leading-none tracking-wide text-enzo-white drop-shadow sm:bottom-5 sm:start-5 sm:text-4xl">
              {localize(c.name)}
            </span>
            <span className="absolute bottom-0 start-0 h-[3px] w-0 bg-enzo-gradient transition-all duration-500 group-hover:w-full" />
          </Link>
        );
      })}
    </div>
  );
}
