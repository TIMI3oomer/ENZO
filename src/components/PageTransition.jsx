import { useLocation } from "react-router-dom";

// Quick fade-up on every page change. Re-keyed per path so the CSS
// animation runs again; no animation library needed.
export default function PageTransition({ children }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="animate-[enzo-page-in_0.2s_ease-out_both]">
      {children}
    </div>
  );
}
