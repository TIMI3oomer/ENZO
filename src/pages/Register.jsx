import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.jsx";
import GoogleButton from "../components/GoogleButton.jsx";
import { MailCheck } from "lucide-react";

// CHECKPOINT NOTE (pages/Register.jsx):
// Plain Supabase Auth sign-up. full_name is saved to user_metadata (see
// AuthContext.register) so Checkout.jsx can prefill the name field for a
// logged-in customer without needing a separate "customers" table.
// Depending on your Supabase project's auth settings, email confirmation
// may be required before the user can sign in — that's controlled in
// Supabase Dashboard -> Authentication -> Providers -> Email, not in code.
export default function Register() {
  const { t } = useTranslation("common");
  const { register, resendConfirmation } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resent, setResent] = useState(false);

  const returnTo = location.state?.from || "/";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    setLoading(true);
    const { error, needsConfirmation } = await register(email, password, fullName);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Confirmation required: say so, instead of quietly sending them back
    // to the shop not actually signed in.
    if (needsConfirmation) {
      setCheckEmail(true);
      return;
    }
    navigate(returnTo);
  }

  if (checkEmail) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center px-4 py-16 text-center">
        <MailCheck size={44} className="text-enzo-goldBright" />
        <h1 className="mt-4 font-display text-2xl">{t("auth.checkEmailTitle")}</h1>
        <p className="mt-3 text-sm text-enzo-muted">{t("auth.checkEmailText", { email })}</p>
        <button
          type="button"
          disabled={resent}
          onClick={async () => {
            await resendConfirmation(email);
            setResent(true);
          }}
          className="mt-5 text-sm text-enzo-gold underline disabled:no-underline disabled:opacity-60"
        >
          {resent ? t("auth.confirmationResent") : t("auth.resendConfirmation")}
        </button>
        <Link to="/login" state={{ from: returnTo }} className="mt-6 rounded-md border hairline px-5 py-2.5 text-sm font-semibold">
          {t("auth.signIn")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4 py-16 text-start">
      <h1 className="mb-6 text-center font-display text-2xl">{t("auth.register")}</h1>
      <GoogleButton returnTo={returnTo} />
      <form onSubmit={handleSubmit}>
        <label className="mb-1 block text-sm font-medium">{t("auth.fullName")}</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input mb-4" required />

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
          minLength={6}
        />

        <label className="mb-1 block text-sm font-medium">{t("auth.confirmPassword")}</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="input mb-4"
          dir="ltr"
          required
          minLength={6}
        />

        {error && <p className="mb-4 text-sm text-enzo-error">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-enzo-gradient py-3 font-semibold text-enzo-black disabled:opacity-40"
        >
          {t("auth.register")}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-enzo-muted">
        {t("auth.haveAccount")}{" "}
        <Link to="/login" state={{ from: returnTo }} className="text-enzo-white underline">
          {t("auth.signIn")}
        </Link>
      </p>
    </div>
  );
}
