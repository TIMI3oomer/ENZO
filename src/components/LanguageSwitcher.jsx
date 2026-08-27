import { useLanguage } from "../context/LanguageContext.jsx";

// CHECKPOINT NOTE (LanguageSwitcher.jsx):
// Clean text-based switcher per the spec ("العربية | English"). Uses
// margin-inline so the divider spacing is correct in both directions
// automatically — no left/right hardcoding.
export default function LanguageSwitcher({ className = "" }) {
  const { lang, setLang } = useLanguage();

  return (
    <div className={`flex items-center text-sm font-medium ${className}`}>
      <button
        onClick={() => setLang("ar")}
        aria-pressed={lang === "ar"}
        className={lang === "ar" ? "text-enzo-white" : "text-enzo-muted hover:text-enzo-white"}
      >
        العربية
      </button>
      <span className="mx-2 text-enzo-line" aria-hidden="true">|</span>
      <button
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={lang === "en" ? "text-enzo-white" : "text-enzo-muted hover:text-enzo-white"}
      >
        English
      </button>
    </div>
  );
}
