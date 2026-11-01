import { useTranslation } from "react-i18next";
import { useContent } from "../hooks/useContent.js";

// CHECKPOINT NOTE (Footer.jsx):
// Logo and contact handle now come from the CMS (src/hooks/useContent.js),
// with these same values as the fallback if no admin override is saved —
// see src/lib/contentManifest.js.
export default function Footer() {
  const { t } = useTranslation("common");
  const content = useContent("site");
  return (
    <footer className="border-t hairline px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 text-center">
        <img src={content.images.logo} alt="ENZO" className="h-14 w-14 rounded-full" />
        <p className="text-sm text-enzo-muted">
          {t("footer.contact")}: {content.footer.contactHandle}
        </p>
        <p className="text-xs text-enzo-muted">
          © {new Date().getFullYear()} ENZO — {t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}
