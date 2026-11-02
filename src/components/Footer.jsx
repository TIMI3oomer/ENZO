import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Phone, MapPin, Instagram } from "lucide-react";
import { useContent } from "../hooks/useContent.js";
import { useLocalizedField } from "../context/LanguageContext.jsx";
import { api } from "../lib/api.js";

// CHECKPOINT NOTE (Footer.jsx):
// Multi-column store footer: brand + contact, shop links (one per
// category), help links, then a bottom bar with payment methods. Logo,
// contact handle and tagline come from the CMS (src/hooks/useContent.js),
// with fallbacks if no admin override is saved -- see
// src/lib/contentManifest.js.
export default function Footer() {
  const { t } = useTranslation("common");
  const localize = useLocalizedField();
  const content = useContent("site");
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get("/categories").then((d) => setCategories(d || [])).catch(() => {});
  }, []);

  const heading = "mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-enzo-white";
  const link = "text-sm text-enzo-muted transition-colors hover:text-enzo-goldBright";

  return (
    <footer className="mt-10 border-t hairline bg-enzo-panel/40">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-4 py-12 text-start sm:px-6 md:grid-cols-4">
        <div className="col-span-2 md:col-span-2">
          <div className="flex items-center gap-3">
            <img src={content.images.logo} alt="ENZO" className="h-12 w-12 rounded-full" />
            <span className="font-display text-2xl tracking-[0.2em]">ENZO</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-enzo-muted">{content.footer.tagline}</p>
          <p className="mt-3 text-sm text-enzo-muted">
            {t("footer.contact")}: <span className="text-enzo-white">{content.footer.contactHandle}</span>
          </p>
          {/* Store details from the CMS (site.store.*) -- each line only shows once it's filled in. */}
          <ul className="mt-3 flex flex-col gap-2 text-sm text-enzo-muted">
            {content.store?.phone && (
              <li className="flex items-center gap-2">
                <Phone size={14} className="text-enzo-gold" />
                <a href={`tel:${content.store.phone}`} dir="ltr" className="hover:text-enzo-white">{content.store.phone}</a>
              </li>
            )}
            {content.store?.instagram && (
              <li className="flex items-center gap-2">
                <Instagram size={14} className="text-enzo-gold" />
                <a
                  href={`https://instagram.com/${content.store.instagram.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  dir="ltr"
                  className="hover:text-enzo-white"
                >
                  @{content.store.instagram.replace(/^@/, "")}
                </a>
              </li>
            )}
            {content.store?.address && (
              <li className="flex items-center gap-2">
                <MapPin size={14} className="text-enzo-gold" />
                {content.store.address}
              </li>
            )}
          </ul>
        </div>

        <div>
          <h3 className={heading}>{t("footer.shop")}</h3>
          <ul className="flex flex-col gap-2.5">
            <li>
              <Link to="/shop" className={link}>{t("footer.allProducts")}</Link>
            </li>
            {categories.slice(0, 6).map((c) => (
              <li key={c.id}>
                <Link to={`/shop/${c.slug}`} className={link}>{localize(c.name)}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className={heading}>{t("footer.help")}</h3>
          <ul className="flex flex-col gap-2.5">
            <li><Link to="/track" className={link}>{t("track.title")}</Link></li>
            <li><Link to="/points" className={link}>{t("points.title")}</Link></li>
            <li><Link to="/account" className={link}>{t("auth.myAccount")}</Link></li>
            <li><Link to="/cart" className={link}>{t("nav.cart")}</Link></li>
            <li><Link to="/login" className={link}>{t("auth.login")}</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t hairline">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 pb-24 pt-5 sm:flex-row sm:pb-5 sm:pe-24 sm:ps-6">
          <div className="flex flex-col items-center gap-1 sm:items-start">
            <p className="text-xs text-enzo-muted">
              © {new Date().getFullYear()} ENZO — {t("footer.rights")}
            </p>
            {/* Who built the site. */}
            <p className="text-[11px] text-enzo-muted/80">
              {t("footer.madeBy")}{" "}
              <a
                href="https://github.com/TIMI3oomer"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-enzo-gold transition-colors hover:text-enzo-goldBright"
              >
                Omar Almuhtaseb
              </a>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {["VISA", "Mastercard", t("trust.cashOnDelivery")].map((m) => (
              <span key={m} className="rounded-sm border border-enzo-line px-2.5 py-1 text-[11px] font-semibold tracking-wide text-enzo-muted">
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
