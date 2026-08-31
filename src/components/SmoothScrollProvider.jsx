import { ReactLenis } from "lenis/react";

// CHECKPOINT NOTE (components/SmoothScrollProvider.jsx):
// Lenis smooths out mouse-wheel/trackpad scrolling site-wide (that
// slightly "gliding" feel instead of the browser's default stepped
// scroll). It wraps the browser's REAL scroll rather than faking it with
// a virtual scrollbar, which is exactly why it needed no changes to
// AnimatedHero.jsx or ScrollShowcase.jsx — framer-motion's useScroll
// listens to native scroll position either way.
// `root` mounts it on the whole document rather than a specific container.
// Anyone with "reduce motion" turned on gets `lerp: 1`, which is
// effectively instant/native scrolling — no smoothing applied, consistent
// with how the rest of the site (LanguageContext, ScrollShowcase,
// AnimatedHero) already treats that preference.
const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function SmoothScrollProvider({ children }) {
  return (
    <ReactLenis
      root
      options={{
        lerp: prefersReducedMotion ? 1 : 0.1,
        duration: 1.1,
        smoothWheel: !prefersReducedMotion,
        touchMultiplier: 1.5,
      }}
    >
      {children}
    </ReactLenis>
  );
}
