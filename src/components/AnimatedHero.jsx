import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import ClothesMarquee from "./ClothesMarquee.jsx";
import OrbitingGarments from "./OrbitingGarments.jsx";
import { useContent } from "../hooks/useContent.js";

// CHECKPOINT NOTE (components/AnimatedHero.jsx):
// The hover-spotlight effect (blur everything except the hovered logo/
// icon) was REMOVED per your note — hover doesn't exist on touch devices,
// and this is primarily a mobile audience, so it was dead code for most
// visitors. Tap-to-navigate (already how the logo/icons work via <Link>)
// is what actually matters on phones, and that still works exactly the
// same. Everything else — the coin flip, the orbiting garments, the
// ambient marquee — is unchanged.
//
//   AT REST (scroll 0)   Headline/subtitle/CTA are fully visible
//                        immediately. Logo sits small, blurred, dim.
//   scroll 0.00 - 0.20   Text fades away while the logo flips (rotateY
//                        0->360) and scales/sharpens into focus.
//   scroll 0.14 - ~0.35  OrbitingGarments.jsx staggers in fast.
//
// Everything here only animates transform/opacity/filter (all
// GPU-composited). useReducedMotion() flattens the flip/scatter to a
// plain fade for anyone with that OS preference.
export default function AnimatedHero({ products, hero }) {
  const siteContent = useContent("site");
  const wrapperRef = useRef(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({ target: wrapperRef, offset: ["start start", "end start"] });

  const rotateY = useTransform(scrollYProgress, [0, 0.2], reduceMotion ? [0, 0] : [0, 360]);
  const logoScale = useTransform(scrollYProgress, [0, 0.2], reduceMotion ? [1, 1] : [0.45, 1]);
  const logoBlur = useTransform(scrollYProgress, [0, 0.2], reduceMotion ? [0, 0] : [6, 0]);
  const logoOpacity = useTransform(scrollYProgress, [0, 0.12], [0.5, 1]);
  const logoFilter = useTransform(logoBlur, (b) => `blur(${b}px)`);

  const textOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 0.15], reduceMotion ? [0, 0] : [0, -16]);

  const heroFadeOut = useTransform(scrollYProgress, [0.85, 1], [1, 0]);

  return (
    <div ref={wrapperRef} className="relative h-[160vh] enzo-grain">
      <div
        className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden px-6 text-center"
        style={{ perspective: "1200px" }}
      >
        <motion.div style={{ opacity: heroFadeOut }} className="relative flex flex-col items-center">
          <div className="relative flex items-center justify-center">
            <motion.img
              src={siteContent.images.logo}
              alt="ENZO"
              style={{ rotateY, scale: logoScale, opacity: logoOpacity, filter: logoFilter, transformStyle: "preserve-3d" }}
              className="relative z-10 h-32 w-32 rounded-full shadow-2xl sm:h-44 sm:w-44"
            />
            <OrbitingGarments products={products} progress={scrollYProgress} />
          </div>

          <motion.div style={{ opacity: textOpacity, y: textY }} className="relative z-10 mt-10">
            <div className="relative">
              <ClothesMarquee products={products} />
              <h1 className="relative z-10 font-display text-4xl leading-tight enzo-gradient-text sm:text-6xl">{hero.title}</h1>
              <p className="relative z-10 mx-auto mt-4 max-w-xl text-enzo-muted sm:text-lg">{hero.subtitle}</p>
            </div>
            <Link
              to="/shop"
              className="enzo-shine relative z-10 mt-8 inline-block rounded-md bg-enzo-gradient px-8 py-3 font-semibold text-enzo-black"
            >
              {hero.cta}
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
