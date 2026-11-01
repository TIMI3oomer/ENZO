import { motion, useReducedMotion } from "framer-motion";

// CHECKPOINT NOTE (components/Reveal.jsx):
// Small shared "fade + rise into place" wrapper for section intros
// (TrustBadges, Home.jsx's section headings) -- one tasteful, consistent
// entrance instead of each section inventing its own. Fires once per
// element (viewport.once) so it never replays while scrolling back up.
// useReducedMotion() drops straight to the final state for anyone with
// that OS preference, same pattern as AnimatedHero.jsx/ScrollShowcase.jsx.
export default function Reveal({ children, delay = 0, className = "" }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
