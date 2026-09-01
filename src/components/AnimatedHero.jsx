import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import ClothesMarquee from "./ClothesMarquee.jsx";
import OrbitingGarments from "./OrbitingGarments.jsx";
import SpotlightOverlay from "./SpotlightOverlay.jsx";

// CHECKPOINT NOTE (components/AnimatedHero.jsx):
// Replaces the old CoinFlipHero.jsx, driven by ONE scroll range (a tall
// wrapper with sticky content pinned inside it):
//
//   AT REST (scroll 0)   Headline/subtitle/CTA are fully visible
//                        immediately — no fade-in wait. The logo sits
//                        small, blurred, and dim behind/beside it.
//   scroll 0.00 - 0.20   As the user starts scrolling, the text fades
//                        AWAY (not in) while the logo flips (rotateY
//                        0->360) and scales/sharpens into focus --
//                        "from background to front."
//   scroll 0.14 - ~0.35  OrbitingGarments.jsx staggers in fast — every
//                        item fully visible within a short window, not
//                        dragged out, so they're clear and clickable
//                        quickly.
//
// ClothesMarquee.jsx (the blurred, low-opacity sliding strip) sits
// specifically BEHIND the headline text, inside the same relative
// container as the text (-z-10).
//
// Everything here only animates transform/opacity/filter (all
// GPU-composited). useReducedMotion() flattens the flip/scatter to a
// plain fade for anyone with that OS preference.
//
// CHECKPOINT NOTE — HOVER SPOTLIGHT: `focused` tracks which element (the
// logo, or a specific orbit item index) currently has hover/keyboard
// focus. SpotlightOverlay.jsx renders a full-page blurred layer above
// everything at z-45; the focused element is bumped to z-50 (see its
// conditional className below and in OrbitingGarments.jsx) so it renders
// ABOVE that blur and stays sharp while it's active.
export default function AnimatedHero({ products }) {
  const { t } = useTranslation("common");
  const wrapperRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const [focused, setFocused] = useState(null); // null | "logo" | orbit item index
  const blurTimer = useRef(null);

  // CHECKPOINT NOTE — debounced hover: without this, moving the mouse
  // between two nearby orbit icons (crossing a small gap of unfocused
  // space in between) flickered the blur overlay off and back on rapidly
  // — this was the main thing making the spotlight feel bad. `focusItem`
  // clears any pending "blur" immediately; `blurItem` waits a beat before
  // actually clearing focus, giving enough time to land on the next icon
  // without the overlay ever fully dropping in between.
  function focusItem(key) {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setFocused(key);
  }
  function blurItem(key) {
    blurTimer.current = setTimeout(() => {
      setFocused((f) => (f === key ? null : f));
    }, 120);
  }

  const { scrollYProgress } = useScroll({ target: wrapperRef, offset: ["start start", "end start"] });

  // CHECKPOINT NOTE — reworked per your latest note: the headline is now
  // visible immediately at rest (progress 0), not faded in after
  // scrolling. As the user starts scrolling, the text fades AWAY and the
  // logo flip + orbiting icons take over — so scrolling reveals "just the
  // icons," not text-then-icons stacked together.
  const rotateY = useTransform(scrollYProgress, [0, 0.2], reduceMotion ? [0, 0] : [0, 360]);
  const logoScale = useTransform(scrollYProgress, [0, 0.2], reduceMotion ? [1, 1] : [0.45, 1]);
  const logoBlur = useTransform(scrollYProgress, [0, 0.2], reduceMotion ? [0, 0] : [6, 0]);
  const logoOpacity = useTransform(scrollYProgress, [0, 0.12], [0.5, 1]);
  const logoFilter = useTransform(logoBlur, (b) => `blur(${b}px)`);

  const textOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 0.15], reduceMotion ? [0, 0] : [0, -16]);

  const heroFadeOut = useTransform(scrollYProgress, [0.85, 1], [1, 0]);

  return (
    <div ref={wrapperRef} className="relative h-[160vh]">
      <SpotlightOverlay active={focused !== null} />
      <div
        className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden px-6 text-center"
        style={{ perspective: "1200px" }}
      >
        <motion.div style={{ opacity: heroFadeOut }} className="relative flex flex-col items-center">
          <div className="relative flex items-center justify-center">
            <motion.img
              src="/logo.jpg"
              alt="ENZO"
              tabIndex={0}
              onMouseEnter={() => focusItem("logo")}
              onMouseLeave={() => blurItem("logo")}
              onFocus={() => focusItem("logo")}
              onBlur={() => blurItem("logo")}
              style={{ rotateY, scale: logoScale, opacity: logoOpacity, filter: logoFilter, transformStyle: "preserve-3d" }}
              className={`relative h-32 w-32 rounded-full shadow-2xl outline-none transition-shadow duration-200 sm:h-44 sm:w-44 ${
                focused === "logo" ? "z-[50] shadow-[0_0_40px_rgba(255,210,63,0.55)]" : "z-10"
              }`}
            />
            <OrbitingGarments products={products} progress={scrollYProgress} focused={focused} focusItem={focusItem} blurItem={blurItem} />
          </div>

          <motion.div style={{ opacity: textOpacity, y: textY }} className="relative z-10 mt-10">
            <div className="relative">
              <ClothesMarquee products={products} />
              <h1 className="relative z-10 font-display text-4xl leading-tight sm:text-6xl">{t("hero.title")}</h1>
              <p className="relative z-10 mx-auto mt-4 max-w-xl text-enzo-muted sm:text-lg">{t("hero.subtitle")}</p>
            </div>
            <Link
              to="/shop"
              className="relative z-10 mt-8 inline-block rounded-md bg-enzo-gradient px-8 py-3 font-semibold text-enzo-black"
            >
              {t("hero.cta")}
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
