import { useMemo } from "react";
import { GARMENT_ICONS } from "./GarmentIcons.jsx";

// CHECKPOINT NOTE (components/ClothesMarquee.jsx):
// Reworked per your latest note: soft, blurred, low-opacity cards sliding
// continuously behind the headline text -- ambient motion, not a crisp
// filmstrip anymore. Uses your real product photos once you have 6+
// (rendered as small rounded cards, blurred), otherwise generic
// silhouette icons (GarmentIcons.jsx) as a fallback on a fresh store.
// Deliberately subtle: opacity 0.10 + a blur filter, specifically so it
// reads as background texture, not a distraction.
export default function ClothesMarquee({ products = [] }) {
  const items = useMemo(() => {
    const images = products.filter((p) => p.images?.[0]).map((p) => p.images[0]);
    if (images.length >= 6) return images.slice(0, 10).map((src) => ({ type: "image", src }));
    return Array.from({ length: 10 }, (_, i) => ({ type: "icon", Icon: GARMENT_ICONS[i % GARMENT_ICONS.length] }));
  }, [products]);

  const row = [...items, ...items]; // duplicated for a seamless loop

  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 top-1/2 -z-10 h-20 -translate-y-1/2 overflow-hidden opacity-[0.10] blur-sm sm:h-24"
    >
      <div className="flex h-full w-max animate-[enzo-marquee_32s_linear_infinite] items-center gap-4">
        {row.map((item, i) => (
          <div key={i} className="flex h-16 w-14 flex-none items-center justify-center rounded-lg bg-enzo-panel sm:h-20 sm:w-16">
            {item.type === "image" ? (
              <img src={item.src} alt="" className="h-full w-full rounded-lg object-cover" />
            ) : (
              <item.Icon className="h-8 w-8 text-enzo-white" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
