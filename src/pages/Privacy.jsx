import { ShieldCheck, Phone, Instagram, MessageCircle } from "lucide-react";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useContent } from "../hooks/useContent.js";
import { PRIVACY, PRIVACY_UPDATED } from "../content/privacyPolicy.js";

// CHECKPOINT NOTE (pages/Privacy.jsx):
// /privacy -- the text lives in src/content/privacyPolicy.js (Arabic and
// English, written to match what the code actually does). Contact details
// come from the CMS store info (site.store.*), falling back to the footer
// contact handle, so they stay in step with the rest of the site.
export default function Privacy() {
  const { lang } = useLanguage();
  const site = useContent("site");
  const p = PRIVACY[lang] || PRIVACY.ar;
  const store = site.store || {};
  const whatsapp = (store.whatsapp || "").replace(/\D/g, "");
  const updated = new Date(PRIVACY_UPDATED).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 text-start sm:px-6">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-enzo-gold/15 text-enzo-goldBright">
        <ShieldCheck size={24} />
      </span>
      <h1 className="mt-4 font-display text-4xl uppercase">{p.title}</h1>
      <p className="mt-2 text-sm text-enzo-muted">
        {p.updated}: {updated}
      </p>
      <p className="mt-6 leading-relaxed text-enzo-white/90">{p.intro}</p>

      {p.sections.map((s, i) => (
        <section key={s.title} className="mt-10">
          <h2 className="flex items-baseline gap-3 font-display text-xl uppercase">
            <span className="text-sm text-enzo-gold">{String(i + 1).padStart(2, "0")}</span>
            {s.title}
          </h2>
          {s.intro && <p className="mt-3 text-sm leading-relaxed text-enzo-muted">{s.intro}</p>}
          <ul className="mt-3 flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed text-enzo-white/85 marker:text-enzo-gold">
            {s.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-12 rounded-lg border border-enzo-gold/30 bg-enzo-gold/5 p-5">
        <h2 className="font-display text-xl uppercase">{p.contactTitle}</h2>
        <p className="mt-2 text-sm text-enzo-muted">{p.contactIntro}</p>
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {whatsapp && (
            <li className="flex items-center gap-2">
              <MessageCircle size={15} className="text-enzo-gold" />
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" dir="ltr" className="hover:text-enzo-goldBright">
                +{whatsapp}
              </a>
            </li>
          )}
          {store.phone && (
            <li className="flex items-center gap-2">
              <Phone size={15} className="text-enzo-gold" />
              <a href={`tel:${store.phone}`} dir="ltr" className="hover:text-enzo-goldBright">
                {store.phone}
              </a>
            </li>
          )}
          {store.instagram && (
            <li className="flex items-center gap-2">
              <Instagram size={15} className="text-enzo-gold" />
              <a
                href={`https://instagram.com/${store.instagram.replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
                dir="ltr"
                className="hover:text-enzo-goldBright"
              >
                @{store.instagram.replace(/^@/, "")}
              </a>
            </li>
          )}
          {!whatsapp && !store.phone && !store.instagram && site.footer?.contactHandle && (
            <li className="flex items-center gap-2">
              <Instagram size={15} className="text-enzo-gold" />
              <span dir="ltr">{site.footer.contactHandle}</span>
            </li>
          )}
        </ul>
      </section>
    </article>
  );
}
