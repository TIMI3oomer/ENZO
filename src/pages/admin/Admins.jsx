import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Mail, Trash2 } from "lucide-react";
import { api } from "../../lib/api.js";
import AdminLayout from "../../components/AdminLayout.jsx";

// CHECKPOINT NOTE (admin/Admins.jsx):
// Who can open the control panel. Add a store owner by email: an existing
// account becomes admin right away; with no account yet, "Send invite"
// has Supabase email them a link to set a password (server/src/routes/
// admin.js -> /admins). You can't remove yourself or the last admin.
export default function AdminAdmins() {
  const { t } = useTranslation("admin");
  const [admins, setAdmins] = useState([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { kind: "ok" | "error" | "noAccount", text }

  const load = () => api.get("/admin/admins").then((d) => setAdmins(d || [])).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function add(invite) {
    setSaving(true);
    setMessage(null);
    try {
      const r = await api.post("/admin/admins", { email: email.trim(), full_name: name.trim() || null, invite });
      setMessage({
        kind: "ok",
        text: r.invited ? t("admins.invited", { email: r.email }) : t("admins.added", { email: r.email }),
      });
      setEmail("");
      setName("");
      load();
    } catch (err) {
      setMessage(
        err.status === 404 ? { kind: "noAccount", text: t("admins.noAccount", { email: email.trim() }) } : { kind: "error", text: err.message }
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(a) {
    if (!confirm(t("admins.confirmRemove", { email: a.email }))) return;
    try {
      await api.del(`/admin/admins/${a.user_id}`);
      load();
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    }
  }

  return (
    <AdminLayout title={t("admins.title")}>
      <p className="mb-6 max-w-2xl text-sm text-enzo-muted">{t("admins.intro")}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add(false);
        }}
        className="mb-8 max-w-2xl rounded-lg border hairline bg-enzo-panel p-5"
      >
        <p className="mb-4 font-medium">{t("admins.add")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="email"
            required
            className="input"
            dir="ltr"
            placeholder={t("admins.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input className="input" placeholder={t("admins.name")} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button
          type="submit"
          disabled={saving || !email.trim()}
          className="mt-4 flex items-center gap-2 rounded-md bg-enzo-gradient px-5 py-2.5 font-semibold text-enzo-black disabled:opacity-40"
        >
          <ShieldCheck size={17} />
          {t("admins.addButton")}
        </button>

        {message?.kind === "ok" && <p className="mt-3 text-sm text-enzo-goldBright">{message.text}</p>}
        {message?.kind === "error" && <p className="mt-3 text-sm text-enzo-error">{message.text}</p>}
        {message?.kind === "noAccount" && (
          <div className="mt-4 rounded-md border border-enzo-gold/40 bg-enzo-gold/10 p-3 text-sm">
            <p className="font-semibold">{message.text}</p>
            <p className="mt-1 text-enzo-muted">{t("admins.noAccountHint")}</p>
            <button
              type="button"
              onClick={() => add(true)}
              disabled={saving}
              className="mt-3 flex items-center gap-2 rounded-md border border-enzo-gold px-4 py-2 font-semibold text-enzo-goldBright disabled:opacity-40"
            >
              <Mail size={15} />
              {t("admins.sendInvite")}
            </button>
          </div>
        )}
      </form>

      <ul className="flex max-w-2xl flex-col divide-y divide-enzo-line rounded-lg border hairline">
        {admins.map((a) => (
          <li key={a.user_id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {a.full_name || a.email}
                {a.isYou && <span className="rounded-full bg-enzo-gold/15 px-2 py-0.5 text-xs text-enzo-goldBright">{t("admins.you")}</span>}
                {a.pending && <span className="rounded-full border hairline px-2 py-0.5 text-xs text-enzo-muted">{t("admins.pending")}</span>}
              </p>
              <p className="truncate text-xs text-enzo-muted" dir="ltr">
                {a.full_name ? a.email : ""}
              </p>
              <p className="text-xs text-enzo-muted">
                {t("admins.since")} {new Date(a.created_at).toLocaleDateString()}
              </p>
            </div>
            {!a.isYou && (
              <button
                type="button"
                onClick={() => remove(a)}
                disabled={admins.length <= 1}
                title={admins.length <= 1 ? t("admins.lastAdmin") : t("admins.remove")}
                className="flex items-center gap-1.5 rounded-md border hairline px-3 py-1.5 text-xs text-enzo-muted hover:border-enzo-error hover:text-enzo-error disabled:opacity-40"
              >
                <Trash2 size={14} />
                {t("admins.remove")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </AdminLayout>
  );
}
