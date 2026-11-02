import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";

// Admin pages: signed in AND listed in admin_users (checked by
// AuthContext). While that check runs a spinner shows; if it takes more
// than 8 seconds (bad connection, server waking up) a reload button
// appears instead of an endless "..." -- that was the "admin isn't
// loading at all" screen.
export default function ProtectedAdminRoute({ children }) {
  const { session, isAdmin, loading } = useAuth();
  const location = useLocation();
  const { t } = useTranslation("admin");
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const id = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(id);
  }, [loading]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-10 text-center text-enzo-muted">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-enzo-line border-t-enzo-goldBright" />
        {slow && (
          <>
            <p className="text-sm">{t("loading.slow")}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-enzo-gradient px-5 py-2 text-sm font-semibold text-enzo-black"
            >
              {t("loading.reload")}
            </button>
          </>
        )}
      </div>
    );
  }
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return children;
}
