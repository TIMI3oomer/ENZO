import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useLocalizedField } from "../context/LanguageContext.jsx";

// CHECKPOINT NOTE (components/ScrollShowcase.jsx):
// As each card enters the viewport, it rises from below and rotates in
// from a 3D angle (alternating left/right per column) into a flat resting
// position. Per your latest note, every card links to /shop (not the
// individual product page) — browsing detail happens after landing in
// the shop grid.
//
// FALLBACK: if the store has no products yet (a fresh install, or the
// backend briefly unreachable), this renders 4 placeholder cards using
// the logo instead of returning nothing — so the animation is always
// visibly demonstrable, and reaching /shop still works from them.
//
// PERFORMANCE: only `transform`/`opacity` are animated (GPU-composited).
// RESPONSIVE: grid goes 2 -> 3 -> 4 columns; rotation kept modest (14deg)
// so cards never swing outside their column on narrow screens.
// ACCESSIBILITY: useReducedMotion() disables the rise/rotate, cards fade in.
const PLACEHOLDER_PRODUCTS = Array.from({ length: 4 }, (_, i) => ({
  id: `placeholder-${i}`,
  name: { ar: "قريباً", en: "Coming soon" },
  images: ["/logo.jpg"],
  isPlaceholder: true,
}));

function ShowcaseCard({ product, index, localize }) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();
  const fromLeft = index % 2 === 0;

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 92%", "start 45%"],
  });

  const y = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [90, 0]);
  const rotateY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [fromLeft ? -14 : 14, 0]);
  const rotateX = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [10, 0]);
  const opacity = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const scale = useTransform(scrollYProgress, [0, 1], reduceMotion ? [1, 1] : [0.9, 1]);

  return (
    <motion.div
      ref={ref}
      style={{ y, rotateY, rotateX, opacity, scale, transformStyle: "preserve-3d" }}
      className="enzo-ring group block"
    >
      <Link to="/shop" className="block">
        <div className={`aspect-[3/4] overflow-hidden rounded-lg bg-enzo-panel ${product.isPlaceholder ? "flex items-center justify-center p-10 opacity-60" : ""}`}>
          {product.images?.[0] ? (
            <img
              src={product.images[0]}
              alt={localize(product.name)}
              className={product.isPlaceholder ? "h-16 w-16 rounded-full object-cover" : "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"}
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-enzo-muted">ENZO</div>
          )}
        </div>
        <p className="mt-3 text-start text-sm font-medium">{localize(product.name)}</p>
      </Link>
    </motion.div>
  );
}

export default function ScrollShowcase({ products }) {
  const localize = useLocalizedField();
  const display = products && products.length > 0 ? products.slice(0, 8) : PLACEHOLDER_PRODUCTS;

  return (
    <section
      className="mx-auto max-w-7xl overflow-x-hidden px-4 py-20 sm:px-6"
      style={{ perspective: "1400px" }}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-16 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
        {display.map((p, i) => (
          <ShowcaseCard key={p.id} product={p} index={i} localize={localize} />
        ))}
      </div>
    </section>
  );
}
