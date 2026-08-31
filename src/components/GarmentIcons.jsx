// CHECKPOINT NOTE (components/GarmentIcons.jsx):
// Plain generic silhouettes (t-shirt, hoodie, pants, sneaker) drawn as
// simple line art — not modeled on any specific product or brand, purely
// functional category shapes (the same idea as any clothing site's
// generic category icons). This keeps the ambient background decoration
// free of the trademark concerns flagged earlier for the reference
// photos. Once real product photos exist, ClothesMarquee.jsx prefers
// those automatically — these are the fallback for a fresh store.
const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round", strokeLinecap: "round" };

export function TshirtIcon(props) {
  return (
    <svg viewBox="0 0 64 64" {...common} {...props}>
      <path d="M20 8 L8 18 L14 26 L20 22 V56 H44 V22 L50 26 L56 18 L44 8 L38 12 H26 Z" />
    </svg>
  );
}

export function HoodieIcon(props) {
  return (
    <svg viewBox="0 0 64 64" {...common} {...props}>
      <path d="M22 10 C22 6 28 4 32 4 C36 4 42 6 42 10 L52 18 L46 26 L42 22 V56 H22 V22 L18 26 L12 18 Z" />
      <circle cx="32" cy="16" r="4" />
    </svg>
  );
}

export function PantsIcon(props) {
  return (
    <svg viewBox="0 0 64 64" {...common} {...props}>
      <path d="M18 6 H46 L48 58 H38 L32 24 L26 58 H16 Z" />
    </svg>
  );
}

export function SneakerIcon(props) {
  return (
    <svg viewBox="0 0 64 64" {...common} {...props}>
      <path d="M6 44 C6 38 12 36 18 34 L34 24 L44 30 L44 38 L58 40 C60 44 58 48 54 48 H8 C6 48 6 46 6 44 Z" />
    </svg>
  );
}

export const GARMENT_ICONS = [TshirtIcon, HoodieIcon, PantsIcon, SneakerIcon];
