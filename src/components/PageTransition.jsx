import { motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";

// CHECKPOINT NOTE (components/PageTransition.jsx):
// A lightweight fade+rise on every route change, keyed by pathname so
// React remounts (and re-plays the animation for) each new page instead
// of only the first one. Kept intentionally short (0.2s) and subtle (8px)
// so it reads as "smoother navigation," not a slideshow effect getting in
// the way of quickly browsing the shop. useReducedMotion drops the
// vertical motion for anyone with that OS preference, consistent with
// every other animation in the app.
export default function PageTransition({ children }) {
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
