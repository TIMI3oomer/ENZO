import { useTranslation } from "react-i18next";
import { AlertCircle, RotateCw } from "lucide-react";

// CHECKPOINT NOTE (components/ErrorBanner.jsx):
// Used wherever a page fetches data that might fail (Shop.jsx, Home.jsx,
// ProductDetail.jsx) — instead of silently swallowing the error into an
// empty/blank state (which is what happens right after a fresh deploy if
// VITE_API_URL or CORS is misconfigured, and looks like "the site is just
// broken" with no explanation), this shows the actual translated message
// from api.js plus a "Try again" button that re-runs whatever fetch
// failed. `message` is already a translated string by the time it gets
// here — see src/lib/api.js, which produces bilingual, actionable
// messages for network failures automatically.
export default function ErrorBanner({ message, onRetry }) {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-enzo-error/30 bg-enzo-error/10 p-6 text-center">
      <AlertCircle size={22} className="text-enzo-error" />
      <p className="text-sm text-enzo-white">{message || t("errors.generic")}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 rounded-md border border-enzo-line px-4 py-2 text-sm text-enzo-muted hover:border-enzo-goldBright hover:text-enzo-white"
        >
          <RotateCw size={14} />
          {t("errors.retry")}
        </button>
      )}
    </div>
  );
}
