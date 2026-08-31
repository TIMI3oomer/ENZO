// CHECKPOINT NOTE (components/SpotlightOverlay.jsx):
// The trick here is `backdrop-filter`, not a regular `filter`: it blurs
// whatever is visually BEHIND this element in the compositing stack
// (navbar, page content, other orbit icons, the logo when it's not the
// one hovered) regardless of DOM nesting — so it doesn't matter that this
// overlay is a sibling, not a parent, of everything it's blurring.
// The hovered element stays sharp simply because it's given a HIGHER
// z-index than this overlay (done in AnimatedHero.jsx/OrbitingGarments.jsx),
// so it renders on top of the blur rather than being blurred by it.
// `pointer-events-none` so the overlay itself never blocks clicks/hover
// on the element that's supposed to stay interactive above it.
export default function SpotlightOverlay({ active }) {
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[45] pointer-events-none transition-all duration-300 ${
        active ? "backdrop-blur-md bg-black/30 opacity-100" : "opacity-0"
      }`}
    />
  );
}
