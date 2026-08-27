import { useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

// CHECKPOINT NOTE (components/CoinFlipHero.jsx):
// The wrapper is 180vh tall, but its content is `sticky top-0 h-screen`
// inside it — that's what "pins" the logo in place on screen while the
// user keeps scrolling, giving the scroll distance to actually animate
// against instead of the flip happening instantly. useScroll tracks
// progress across that whole 180vh range: the logo spins two full turns
// (rotateY 0 -> 720, a real coin-flip motion, not just a wobble), then
// scales down and fades as the section hands off to ScrollShowcase below.
// Only `transform`/`opacity` are animated (GPU-composited, no layout
// cost). useReducedMotion() drops the spin to a plain fade for anyone
// with that OS preference.
export default function CoinFlipHero() {
  const { t } = useTranslation("common");
  const wrapperRef = useRef(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({ target: wrapperRef, offset: ["start start", "end start"] });

  const rotateY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, 720]);
  const scale = useTransform(scrollYProgress, [0, 0.75, 1], [1, 1, 0.65]);
  const opacity = useTransform(scrollYProgress, [0, 0.7, 1], [1, 1, 0]);

  return (
    <div ref={wrapperRef} className="relative h-[180vh]">
      <div
        className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden px-6 text-center"
        style={{ perspective: "1200px" }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute h-96 w-96 rounded-full bg-enzo-gradient opacity-20 blur-3xl"
        />
        <motion.img
          src="/logo.jpg"
          alt="ENZO"
          style={{ rotateY, scale, transformStyle: "preserve-3d" }}
          className="h-32 w-32 rounded-full shadow-2xl sm:h-44 sm:w-44"
        />
        <motion.div style={{ opacity }}>
          <h1 className="mt-8 font-display text-4xl leading-tight sm:text-6xl">{t("hero.title")}</h1>
          <p className="mx-auto mt-4 max-w-xl text-enzo-muted sm:text-lg">{t("hero.subtitle")}</p>
          <Link
            to="/shop"
            className="mt-8 inline-block rounded-md bg-enzo-gradient px-8 py-3 font-semibold text-enzo-black"
          >
            {t("hero.cta")}
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
