import { useTranslation } from "react-i18next";

// CHECKPOINT NOTE (Footer.jsx):
// Static footer copy for now — social/contact links are placeholders
// pulled loosely from the ENZO Instagram bio. Replace the href values with
// real links (WhatsApp, Instagram, Maps) before launch.
export default function Footer() {
  const { t } = useTranslation("common");
  return (
    <footer className="border-t hairline px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 text-center">
        <img src="/logo.jpg" alt="ENZO" className="h-14 w-14 rounded-full" />
        <p className="text-sm text-enzo-muted">{t("footer.contact")}: enzo.m.w1</p>
        <p className="text-xs text-enzo-muted">
          © {new Date().getFullYear()} ENZO — {t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}
