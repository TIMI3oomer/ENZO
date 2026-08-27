import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext.jsx";
import LanguageSwitcher from "../../components/LanguageSwitcher.jsx";

// CHECKPOINT NOTE (admin/Login.jsx):
// Plain email/password sign-in against Supabase Auth. Create the store
// owner's account once via Supabase Dashboard -> Authentication -> Users
// -> Add user, then insert their id into admin_users (see schema.sql).
// There is no public "sign up" flow here on purpose — admin accounts
// should only ever be created by whoever controls the Supabase project.
export default function AdminLogin() {
  const { t } = useTranslation("admin");
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    navigate("/admin");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-enzo-black px-4">
      <div className="mb-8 flex flex-col items-center gap-4">
        <img src="/logo.jpg" alt="ENZO" className="h-14 w-14 rounded-full" />
        <LanguageSwitcher />
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-sm text-start">
        <h1 className="mb-6 text-center font-display text-2xl">{t("login.title")}</h1>
        <label className="mb-1 block text-sm font-medium">{t("login.email")}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input mb-4"
          dir="ltr"
          required
        />
        <label className="mb-1 block text-sm font-medium">{t("login.password")}</label>
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
          {t("login.submit")}
        </button>
      </form>
    </div>
  );
}
