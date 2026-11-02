import { useEffect, useRef, useState } from "react";

// Fades + lifts its children in the first time they scroll into view.
// Plain IntersectionObserver + a CSS transition (no animation library in
// the bundle every visitor downloads). Reduced-motion users get the
// content immediately -- see the prefers-reduced-motion rule in index.css.
export default function Reveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -60px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ease-out ${shown ? "translate-y-0 opacity-100" : "translate-y-[18px] opacity-0"} ${className}`}
      style={{ transitionDelay: shown ? `${delay}s` : "0s" }}
    >
      {children}
    </div>
  );
}
