import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useTransform, useReducedMotion } from "framer-motion";
import { GARMENT_ICONS } from "./GarmentIcons.jsx";

// CHECKPOINT NOTE (components/OrbitingGarments.jsx):
// Positions are scattered around the logo with randomized angle/radius
// jitter, computed ONCE via useMemo (not on every render, and not tied to
// a specific seed — a fresh scatter per page load reads as more organic
// without ever causing layout thrash). Each item is two nested layers:
// the OUTER div's position/scale/opacity is driven by scroll progress
// (via the `progress` motion value passed in from AnimatedHero), while
// the INNER image spins continuously via a plain CSS animation — two
// separate transforms on two separate nodes, so they never fight each
// other. This is CSS-simulated "3D" (perspective + rotateY), not a real
// WebGL/3D-model renderer — there's no 3D asset pipeline in this project,
// and this reads as the same spinning-in-space effect without needing one.
//
// HOVER SPOTLIGHT: `focused`/`setFocused` are lifted state from
// AnimatedHero.jsx, shared with the logo. Hovering (or keyboard-focusing)
// an item bumps its z-index above SpotlightOverlay.jsx's blur layer — see
// AnimatedHero.jsx for the full explanation of how that layering works.
const RADIUS_BASE = typeof window !== "undefined" && window.innerWidth < 640 ? 100 : 170;

function useScatterLayout(count) {
  return useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (360 / count) * i + (Math.random() * 30 - 15);
      const radius = RADIUS_BASE + (Math.random() * 40 - 20);
      const rad = (angle * Math.PI) / 180;
      return {
        x: Math.cos(rad) * radius,
        y: Math.sin(rad) * radius,
        spinDuration: 6 + Math.random() * 6, // 6-12s, varied so it doesn't look mechanical
        spinDirection: Math.random() > 0.5 ? "normal" : "reverse",
        delay: i * 0.06,
      };
    });
  }, [count]);
}

function OrbitItem({ item, layout, progress, index, focused, focusItem, blurItem }) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();
  const isFocused = focused === index;

  // Staggered entrance, compressed further so items appear almost right
  // after the logo settles — clearly visible and clickable fast, not a
  // slow drip.
  const start = 0.14 + index * 0.02;
  const end = Math.min(start + 0.12, 1);

  const scale = useTransform(progress, [start, end], reduceMotion ? [1, 1] : [0, 1]);
  const opacity = useTransform(progress, [start, end], [0, 1]);
  const x = useTransform(progress, [start, end], reduceMotion ? [layout.x, layout.x] : [0, layout.x]);
  const y = useTransform(progress, [start, end], reduceMotion ? [layout.y, layout.y] : [0, layout.y]);

  return (
    <motion.div
      ref={ref}
      style={{ x, y, scale, opacity }}
      className={`absolute start-1/2 top-1/2 -ms-10 -mt-10 h-20 w-20 sm:h-24 sm:w-24 ${isFocused ? "z-[50]" : "z-0"}`}
    >
      <Link
        to="/shop"
        tabIndex={0}
        onMouseEnter={() => focusItem(index)}
        onMouseLeave={() => blurItem(index)}
        onFocus={() => focusItem(index)}
        onBlur={() => blurItem(index)}
        className="enzo-ring block h-full w-full rounded-full outline-none"
      >
        <div
          className={`h-full w-full rounded-full bg-enzo-panel shadow-lg transition-shadow duration-200 ${
            isFocused ? "ring-2 ring-enzo-goldBright shadow-[0_0_28px_rgba(255,210,63,0.55)]" : ""
          }`}
          style={{
            animation: reduceMotion ? "none" : `enzo-spin-y ${layout.spinDuration}s linear infinite ${layout.spinDirection}`,
            transformStyle: "preserve-3d",
          }}
        >
          {item.type === "image" ? (
            <img src={item.src} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-3 text-enzo-gold">
              <item.Icon className="h-full w-full" />
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

export default function OrbitingGarments({ products, progress, focused, focusItem, blurItem }) {
  const items = useMemo(() => {
    const images = (products || []).filter((p) => p.images?.[0]).slice(0, 6);
    if (images.length >= 4) return images.map((p) => ({ type: "image", src: p.images[0] }));
    // Capped at GARMENT_ICONS.length on purpose — cycling past that with
    // modulo would repeat the same shape (that was the "duplicated icons"
    // bug). Add more icons to GarmentIcons.jsx if you want more than 4
    // fallback items before you have 4+ real products.
    return GARMENT_ICONS.map((Icon) => ({ type: "icon", Icon }));
  }, [products]);

  const layouts = useScatterLayout(items.length);

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="pointer-events-auto relative h-full w-full">
        {items.map((item, i) => (
          <OrbitItem
            key={i}
            item={item}
            layout={layouts[i]}
            progress={progress}
            index={i}
            focused={focused}
            focusItem={focusItem}
            blurItem={blurItem}
          />
        ))}
      </div>
    </div>
  );
}
