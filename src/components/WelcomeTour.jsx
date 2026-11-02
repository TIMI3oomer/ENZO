import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, SlidersHorizontal, Palette, ShoppingBag, Coins, Truck, MessageCircle, X } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

// CHECKPOINT NOTE (components/WelcomeTour.jsx):
// A short "how this shop works" tour shown ONCE, the first time a customer
// signs in. Finished/skipped is saved on the account (user_metadata.
// tour_done) so it doesn't come back on another phone, plus localStorage so
// it never flashes again while that save is in flight. Account.jsx can
// replay it by dispatching the "enzo:tour" window event. Never shown on
// admin pages.
const STEPS = [
  { key: "welcome", icon: Sparkles },
  { key: "browse", icon: SlidersHorizontal, to: "/shop" },
  { key: "colors", icon: Palette },
  { key: "checkout", icon: ShoppingBag },
  { key: "points", icon: Coins, to: "/points" },
  { key: "track", icon: Truck, to: "/track" },
  { key: "help", icon: MessageCircle },
];

const doneKey = (id) => `enzo_tour_done_${id}`;

export default function WelcomeTour() {
  const { t } = useTranslation("common");
  const { session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const user = session?.user;

  // First sign-in: open once, a moment after the page settles.
  useEffect(() => {
    if (!user || location.pathname.startsWith("/admin")) return;
    let seen = user.user_metadata?.tour_done;
    try {
      seen = seen || localStorage.getItem(doneKey(user.id)) === "1";
    } catch {
      /* storage blocked -- rely on the account flag */
    }
    if (seen) return;
    const id = setTimeout(() => {
      setStep(0);
      setOpen(true);
    }, 900);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Replay on demand (Account page button).
  useEffect(() => {
    const replay = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener("enzo:tour", replay);
    return () => window.removeEventListener("enzo:tour", replay);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function finish(goTo) {
    setOpen(false);
    if (user) {
      try {
        localStorage.setItem(doneKey(user.id), "1");
      } catch {
        /* ignore */
      }
      if (!user.user_metadata?.tour_done) supabase.auth.updateUser({ data: { tour_done: true } }).catch(() => {});
    }
    if (goTo) navigate(goTo);
  }

  if (!open) return null;
  const current = STEPS[step];
  const Icon = current.icon;
  const last = step === STEPS.length - 1;
  const name = user?.user_metadata?.full_name?.split(" ")[0];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-enzo-gold/30 bg-enzo-black text-start shadow-2xl">
        <div className="h-1 bg-enzo-line">
          <div className="h-full bg-enzo-gradient transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        <button
          type="button"
          onClick={() => finish()}
          aria-label={t("tour.skip")}
          className="absolute end-3 top-4 rounded-full p-1.5 text-enzo-muted hover:bg-white/10 hover:text-enzo-white"
        >
          <X size={18} />
        </button>

        <div key={step} className="animate-[enzo-rise_0.45s_ease-out_both] px-6 pb-6 pt-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-enzo-gradient text-enzo-black">
            <Icon size={26} />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-enzo-gold">
            {t("tour.stepOf", { step: step + 1, total: STEPS.length })}
          </p>
          <h2 className="mt-1 font-display text-2xl uppercase">
            {t(`tour.${current.key}Title`, { name: name || "" })}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-enzo-muted">{t(`tour.${current.key}Text`)}</p>

          {current.to && (
            <button type="button" onClick={() => finish(current.to)} className="mt-3 text-sm text-enzo-gold underline">
              {t(`tour.${current.key}Link`)}
            </button>
          )}

          <div className="mt-7 flex items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStep(i)}
                  aria-label={`${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-enzo-goldBright" : "w-1.5 bg-enzo-line"}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {step > 0 && (
                <button type="button" onClick={() => setStep(step - 1)} className="rounded-md border hairline px-4 py-2 text-sm">
                  {t("tour.back")}
                </button>
              )}
              <button
                type="button"
                onClick={() => (last ? finish("/shop") : setStep(step + 1))}
                className="rounded-md bg-enzo-gradient px-5 py-2 text-sm font-semibold text-enzo-black"
              >
                {last ? t("tour.start") : t("tour.next")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
