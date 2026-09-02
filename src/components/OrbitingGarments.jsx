import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useTransform, useReducedMotion } from "framer-motion";
import { GARMENT_ICONS } from "./GarmentIcons.jsx";

// CHECKPOINT NOTE (components/OrbitingGarments.jsx):
// Positions are scattered around the logo with randomized angle/radius
// jitter, computed ONCE via useMemo. Each item is two nested layers: the
// OUTER div's position/scale/opacity is driven by scroll progress, while
// the INNER image spins continuously via a plain CSS animation. This is
// CSS-simulated "3D" (perspective + rotateY), not a real WebGL/3D-model
// renderer — there's no 3D asset pipeline in this project.
//
// The hover-spotlight effect from an earlier version was removed (see
// AnimatedHero.jsx) — hover isn't meaningful on touch devices, which is
// most of this site's traffic. Tapping an icon still navigates to /shop
// exactly as before via the <Link>.
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
        spinDuration: 6 + Math.random() * 6,
        spinDirection: Math.random() > 0.5 ? "normal" : "reverse",
        delay: i * 0.06,
      };
    });
  }, [count]);
}

function OrbitItem({ item, layout, progress, index }) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();

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
      className="absolute start-1/2 top-1/2 -ms-10 -mt-10 h-20 w-20 sm:h-24 sm:w-24"
    >
      <Link to="/shop" className="enzo-ring block h-full w-full rounded-full">
        <div
          className="h-full w-full rounded-full bg-enzo-panel shadow-lg"
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

export default function OrbitingGarments({ products, progress }) {
  const items = useMemo(() => {
    const images = (products || []).filter((p) => p.images?.[0]).slice(0, 6);
    if (images.length >= 4) return images.map((p) => ({ type: "image", src: p.images[0] }));
    return GARMENT_ICONS.map((Icon) => ({ type: "icon", Icon }));
  }, [products]);

  const layouts = useScatterLayout(items.length);

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="pointer-events-auto relative h-full w-full">
        {items.map((item, i) => (
          <OrbitItem key={i} item={item} layout={layouts[i]} progress={progress} index={i} />
        ))}
      </div>
    </div>
  );
}
