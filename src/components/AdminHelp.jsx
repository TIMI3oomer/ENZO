import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Info, X, ListChecks, Lightbulb } from "lucide-react";

// CHECKPOINT NOTE (components/AdminHelp.jsx):
// The (i) button next to every admin page title. Opens a side panel that
// explains that tab: what it's for, how to use it step by step, and tips.
// Which text is shown comes from the current address (HELP_FOR below);
// the text itself lives in the admin.json translations under "help".
const HELP_FOR = [
  [/^\/admin\/products\/(new|[^/]+\/edit)/, "productForm"],
  [/^\/admin\/products/, "products"],
  [/^\/admin\/orders/, "orders"],
  [/^\/admin\/customers/, "customers"],
  [/^\/admin\/categories/, "categories"],
  [/^\/admin\/content/, "content"],
  [/^\/admin\/in-store-sale/, "inStoreSale"],
  [/^\/admin\/discount-codes/, "codes"],
  [/^\/admin\/admins/, "admins"],
  [/^\/admin\/?$/, "dashboard"],
];

export default function AdminHelp() {
  const { t } = useTranslation("admin");
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const key = HELP_FOR.find(([re]) => re.test(pathname))?.[1];

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!key) return null;
  const steps = t(`help.${key}.steps`, { returnObjects: true });
  const tips = t(`help.${key}.tips`, { returnObjects: true });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("help.open")}
        title={t("help.open")}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-enzo-gold/50 text-enzo-goldBright transition-colors hover:bg-enzo-gold hover:text-enzo-black"
      >
        <Info size={17} />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex justify-end bg-black/60" onClick={() => setOpen(false)}>
            <aside
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-full max-w-md animate-[enzo-rise_0.3s_ease-out_both] flex-col border-s hairline bg-enzo-black text-start"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-start justify-between gap-3 border-b hairline p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-enzo-gold">{t("help.howTo")}</p>
                  <h2 className="mt-1 font-display text-2xl">{t(`help.${key}.title`)}</h2>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="close" className="rounded-full p-1.5 text-enzo-muted hover:bg-white/10">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed">
                <p className="text-enzo-muted">{t(`help.${key}.intro`)}</p>

                {Array.isArray(steps) && (
                  <>
                    <p className="mb-3 mt-6 flex items-center gap-2 font-semibold">
                      <ListChecks size={17} className="text-enzo-goldBright" />
                      {t("help.stepsTitle")}
                    </p>
                    <ol className="flex flex-col gap-3">
                      {steps.map((s, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-enzo-gold/15 text-xs font-semibold text-enzo-goldBright">
                            {i + 1}
                          </span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}

                {Array.isArray(tips) && tips.length > 0 && (
                  <div className="mt-6 rounded-lg border border-enzo-gold/30 bg-enzo-gold/5 p-4">
                    <p className="mb-2 flex items-center gap-2 font-semibold">
                      <Lightbulb size={16} className="text-enzo-goldBright" />
                      {t("help.tipsTitle")}
                    </p>
                    <ul className="flex list-disc flex-col gap-1.5 ps-5 text-enzo-muted">
                      {tips.map((tip, i) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </aside>
          </div>,
          document.body
        )}
    </>
  );
}
