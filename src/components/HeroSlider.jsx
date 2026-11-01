import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

// CHECKPOINT NOTE (components/HeroSlider.jsx):
// Full-width campaign banner at the top of the home page. The slides are
// the banner images uploaded in the CMS (home.hero.image1..3, see
// lib/contentManifest.js) with the CMS heading/subtitle/button on top.
// With no banner uploaded yet, it falls back to a typographic slide built
// from the newest product photos, so the page never opens on a blank box.
export default function HeroSlider({ hero, products = [] }) {
  const slides = [hero.image1, hero.image2, hero.image3].filter(Boolean);
  const [index, setIndex] = useState(0);
  const count = slides.length;

  useEffect(() => {
    if (count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(id);
  }, [count]);

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [index, count]);

  const go = (step) => setIndex((i) => (i + step + count) % count);

  return (
    <section className="relative h-[72vh] max-h-[680px] min-h-[440px] overflow-hidden bg-enzo-panel">
      {count > 0 ? (
        slides.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
          />
        ))
      ) : (
        <FallbackArt products={products} />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />

      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-7xl flex-col items-start gap-3 px-5 pb-12 text-start sm:px-8 sm:pb-16">
        <h1 className="max-w-2xl font-display text-5xl uppercase leading-[0.95] text-enzo-white drop-shadow-lg sm:text-7xl">
          {hero.title}
        </h1>
        <p className="max-w-md text-sm text-enzo-white/80 sm:text-base">{hero.subtitle}</p>
        <Link
          to="/shop"
          className="mt-2 rounded-sm bg-enzo-white px-7 py-3 text-sm font-semibold uppercase tracking-wider text-enzo-black transition-colors hover:bg-enzo-goldBright"
        >
          {hero.cta}
        </Link>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="previous"
            className="absolute start-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-enzo-white/90 text-enzo-black hover:bg-enzo-goldBright sm:flex"
          >
            <ChevronLeft size={22} className="rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="next"
            className="absolute end-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-enzo-white/90 text-enzo-black hover:bg-enzo-goldBright sm:flex"
          >
            <ChevronRight size={22} className="rtl:rotate-180" />
          </button>
          <div className="absolute bottom-5 end-5 flex gap-2 sm:end-8">
            {slides.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-8 bg-enzo-goldBright" : "w-3 bg-enzo-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// No banner uploaded: oversized brand word behind a strip of the newest
// product photos.
function FallbackArt({ products }) {
  const photos = products.map((p) => p.images?.[0]).filter(Boolean).slice(0, 3);
  return (
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,162,39,0.22),transparent_65%)]">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-[8%] select-none text-center font-display text-[28vw] leading-none text-enzo-gold/10 sm:text-[20vw]"
      >
        ENZO
      </span>
      {photos.length > 0 && (
        <div className="absolute inset-x-0 top-[14%] mx-auto flex max-w-4xl justify-center gap-3 px-6 sm:gap-5">
          {photos.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              className={`aspect-[3/4] w-1/3 max-w-[220px] object-cover shadow-2xl ${i === 1 ? "translate-y-6" : ""}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
