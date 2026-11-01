import { Link } from "react-router-dom";

// CHECKPOINT NOTE (components/EditorialBanner.jsx):
// Wide campaign banner between the home page's product sections ("new
// season" / lookbook moment). Image, heading, text and button all come
// from the CMS (home.editorial.*); with no image uploaded the gold-tinted
// panel still reads as an intentional banner.
export default function EditorialBanner({ editorial }) {
  return (
    <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6">
      <div className="relative flex min-h-[320px] items-end overflow-hidden bg-enzo-panel sm:min-h-[420px] sm:items-center">
        {editorial.image ? (
          <img src={editorial.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(120deg,#161616_30%,rgba(201,162,39,0.25))]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent sm:bg-gradient-to-r sm:from-black/80 sm:via-black/40 rtl:sm:bg-gradient-to-l" />

        <div className="relative max-w-md p-6 text-start sm:p-12">
          <span className="mb-3 block h-[3px] w-10 bg-enzo-gradient" />
          <h2 className="font-display text-4xl uppercase leading-none text-enzo-white sm:text-6xl">{editorial.title}</h2>
          <p className="mt-3 text-sm text-enzo-white/80">{editorial.text}</p>
          <Link
            to="/shop"
            className="mt-5 inline-block rounded-sm border border-enzo-white px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-enzo-white transition-colors hover:border-enzo-goldBright hover:bg-enzo-goldBright hover:text-enzo-black"
          >
            {editorial.cta}
          </Link>
        </div>
      </div>
    </section>
  );
}
