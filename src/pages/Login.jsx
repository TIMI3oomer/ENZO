import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";

// CHECKPOINT NOTE (pages/Login.jsx):
// This is the CUSTOMER-facing login (different from pages/admin/Login.jsx).
// It reuses the same AuthContext/Supabase session — a customer who signs
// in here is just a normal Supabase Auth user with no admin_users row, so
// they can never reach /admin (see ProtectedAdminRoute.jsx). After login it
// returns to wherever the customer came from (e.g. back to /checkout).
export default function Login() {
  const { t } = useTranslation("common");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const returnTo = location.state?.from || "/";

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await login(email, password);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate(returnTo);
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4 py-16 text-start">
      <h1 className="mb-6 text-center font-display text-2xl">{t("auth.welcomeBack")}</h1>
      <form onSubmit={handleSubmit}>
        <label className="mb-1 block text-sm font-medium">{t("auth.email")}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input mb-4"
          dir="ltr"
          required
        />
        <label className="mb-1 block text-sm font-medium">{t("auth.password")}</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input mb-4"
          dir="ltr"
          required
        />
        {error && <p className="mb-4 text-sm text-enzo-error">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-enzo-gradient py-3 font-semibold text-enzo-black disabled:opacity-40"
        >
          {t("auth.signIn")}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-enzo-muted">
        {t("auth.noAccount")}{" "}
        <Link to="/register" state={{ from: returnTo }} className="text-enzo-white underline">
          {t("auth.createOne")}
        </Link>
      </p>
      {returnTo === "/checkout" && (
        <Link to="/checkout" className="mt-3 text-center text-sm text-enzo-muted underline">
          {t("auth.continueAsGuest")}
        </Link>
      )}
    </div>
  );
}
