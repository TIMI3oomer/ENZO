import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Shown for any URL that matches no route (previously the page area was
// just blank). Uses existing translation keys: common errors.notFound and
// checkout confirmation.backHome.
export default function NotFound() {
  const { t: tc } = useTranslation("common");
  const { t } = useTranslation("checkout");

  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="font-display text-5xl">404</p>
      <p className="mt-4 text-enzo-muted">{tc("errors.notFound")}</p>
      <Link to="/" className="mt-8 inline-block rounded-md bg-enzo-gradient px-6 py-3 font-semibold text-enzo-black">
        {t("confirmation.backHome")}
      </Link>
    </div>
  );
}
