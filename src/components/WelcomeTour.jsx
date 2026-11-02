import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X, ArrowLeft, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useContent } from "../hooks/useContent.js";
import { supabase } from "../lib/supabaseClient.js";
import { api } from "../lib/api.js";
import { pickFeatured } from "../lib/tourFocus.js";
import { useLenis } from "lenis/react";

// CHECKPOINT NOTE (components/WelcomeTour.jsx):
// Guided "show, don't tell" tour. Each step goes to a page, scrolls to a
// real element (marked with data-tour="..." / data-tour-product in the
// pages) and zooms the spotlight in on it: the lit window shrinks from the
// whole screen down to the element while the element itself scales up a
// touch, with a caption card next to it (a bottom sheet on phones).
//
// The product it features is picked by lib/tourFocus.js -- the newest item
// or the latest discount, whichever happened last, unless the admin forces
// one in the CMS (site.tour.focus).
//
// When it runs: once, the first time a customer signs in (saved on the
// account as user_metadata.tour_done + localStorage), and any time the
// "enzo:tour" event fires (footer "How to shop", Account page replay).
// Steps whose element isn't on the page (e.g. points while signed out)
// are skipped. Never runs on admin pages.

const PAD = 10;
const doneKey = (id) => `enzo_tour_done_${id}`;

function buildSteps(featured, signedIn) {
  const productPath = featured ? `/product/${featured.product.slug}` : null;
  const steps = [{ key: "welcome", path: "/" }];
  if (featured) {
    steps.push({
      key: featured.kind === "sale" ? "featuredSale" : "featuredNew",
      path: "/",
      target: `[data-tour-product="${featured.product.id}"]`,
    });
  }
  steps.push({ key: "menu", path: "/", target: '[data-tour="menu"]' });
  steps.push({ key: "sizes", path: "/shop", target: '[data-tour="size-filter"]' });
  if (productPath) {
    steps.push({ key: "colors", path: productPath, target: '[data-tour="colors"]' });
    steps.push({ key: "pickSize", path: productPath, target: '[data-tour="sizes"]' });
    steps.push({ key: "add", path: productPath, target: '[data-tour="add-to-cart"]' });
  }
  steps.push({ key: "cart", path: productPath || "/shop", target: '[data-tour="cart"]' });
  steps.push({ key: "code", path: "/checkout", target: '[data-tour="discount-code"]' });
  // the points box only exists for signed-in customers
  if (signedIn) steps.push({ key: "points", path: "/checkout", target: '[data-tour="points"]' });
  steps.push({ key: "track", path: "/track", target: '[data-tour="track-form"]' });
  steps.push({ key: "help", path: "/track", target: '[data-tour="whatsapp"]' });
  return steps;
}

// Wait for an element to appear (pages load their data asynchronously).
function waitFor(selector, timeout = 2500) {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const el = [...document.querySelectorAll(selector)].find((e) => e.getBoundingClientRect().width > 0);
      if (el) return resolve(el);
      if (performance.now() - start > timeout) return resolve(null);
      setTimeout(tick, 120);
    };
    tick();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function WelcomeTour() {
  const { t } = useTranslation("common");
  const { session } = useAuth();
  const site = useContent("site");
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState([]);
  const [featured, setFeatured] = useState(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null); // spotlight box (viewport px) or null = no target
  const [busy, setBusy] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  // The site scrolls through Lenis (SmoothScrollProvider); a plain
  // window.scrollTo gets overridden by it, so the tour scrolls through it.
  const lenis = useLenis();
  const targetRef = useRef(null);
  const restoreRef = useRef(null);
  const dirRef = useRef(1);
  const startPathRef = useRef("/");

  const user = session?.user;

  const start = useCallback(async () => {
    if (location.pathname.startsWith("/admin")) return;
    startPathRef.current = location.pathname;
    let products = [];
    try {
      products = (await api.get("/products")) || [];
    } catch {
      /* tour still works without a featured product */
    }
    const pick = pickFeatured(products, site.tour?.focus || "auto");
    setFeatured(pick);
    setSteps(buildSteps(pick, !!session));
    dirRef.current = 1;
    setIndex(0);
    setOpen(true);
  }, [location.pathname, site.tour?.focus, session]);

  // First sign-in.
  useEffect(() => {
    if (!user || location.pathname.startsWith("/admin")) return;
    let seen = user.user_metadata?.tour_done;
    try {
      seen = seen || localStorage.getItem(doneKey(user.id)) === "1";
    } catch {
      /* storage blocked -- rely on the account flag */
    }
    if (seen) return;
    const id = setTimeout(start, 1200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // On demand (footer "How to shop", Account page).
  useEffect(() => {
    const onStart = () => start();
    window.addEventListener("enzo:tour", onStart);
    return () => window.removeEventListener("enzo:tour", onStart);
  }, [start]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const unzoom = () => {
    const el = targetRef.current;
    if (el && restoreRef.current) {
      el.style.transform = restoreRef.current.transform;
      el.style.transition = restoreRef.current.transition;
      el.style.position = restoreRef.current.position;
      el.style.zIndex = restoreRef.current.zIndex;
    }
    targetRef.current = null;
    restoreRef.current = null;
  };

  const measure = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, []);

  // Go to the step: change page, find the element, scroll, zoom in.
  useEffect(() => {
    if (!open || !steps[index]) return;
    let cancelled = false;
    const step = steps[index];

    (async () => {
      setBusy(true);
      unzoom();
      // "camera" pulls back to the whole screen first...
      setRect({ top: 0, left: 0, width: window.innerWidth, height: window.innerHeight, full: true });

      if (location.pathname !== step.path) {
        navigate(step.path);
        await sleep(350);
      }
      if (!step.target) {
        if (!cancelled) {
          setRect(null);
          setBusy(false);
        }
        return;
      }

      const el = await waitFor(step.target);
      if (cancelled) return;
      if (!el) {
        // not on this page right now (e.g. points while signed out) -- skip it
        const next = index + dirRef.current;
        if (next >= 0 && next < steps.length) setIndex(next);
        else finish();
        return;
      }

      const r = el.getBoundingClientRect();
      const targetTop = Math.max(0, window.scrollY + r.top - (window.innerHeight - r.height) / (isPhone ? 3.2 : 2.4));
      if (lenis) lenis.scrollTo(targetTop, { duration: 0.6 });
      else window.scrollTo({ top: targetTop, behavior: "smooth" });
      // product rails scroll sideways: centre the card in its row too
      const row = el.closest(".overflow-x-auto");
      if (row) {
        const rr = row.getBoundingClientRect();
        row.scrollTo({ left: row.scrollLeft + (r.left - rr.left) - (rr.width - r.width) / 2, behavior: "smooth" });
      }
      await sleep(750);
      if (cancelled) return;

      // Fallback: if smooth scrolling didn't get there (e.g. the tab was in
      // the background, where animation frames pause), jump straight to it.
      const after = el.getBoundingClientRect();
      if (after.bottom < 0 || after.top > window.innerHeight) {
        const top = Math.max(0, window.scrollY + after.top - (window.innerHeight - after.height) / (isPhone ? 3.2 : 2.4));
        if (lenis) lenis.scrollTo(top, { immediate: true, force: true });
        window.scrollTo(0, top);
        await sleep(60);
      }

      // ...then zooms in on the element.
      targetRef.current = el;
      restoreRef.current = {
        transform: el.style.transform,
        transition: el.style.transition,
        position: el.style.position,
        zIndex: el.style.zIndex,
      };
      if (step.target !== '[data-tour="whatsapp"]') {
        el.style.transition = "transform 0.6s cubic-bezier(.2,.8,.2,1)";
        // wide elements (full-width rows on a phone) get a gentler zoom so
        // they don't push past the screen edges
        const zoom = el.getBoundingClientRect().width > window.innerWidth * 0.75 ? 1.015 : 1.05;
        el.style.transform = `${restoreRef.current.transform || ""} scale(${zoom})`.trim();
      }
      measure();
      setBusy(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, steps]);

  // Keep the spotlight on the element while the page moves.
  useLayoutEffect(() => {
    if (!open) return;
    const onMove = () => requestAnimationFrame(measure);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const forward = (e.key === "ArrowLeft") === (document.documentElement.dir === "rtl");
        forward ? next() : back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, steps]);

  function next() {
    dirRef.current = 1;
    if (index >= steps.length - 1) finish(true);
    else setIndex(index + 1);
  }
  function back() {
    dirRef.current = -1;
    if (index > 0) setIndex(index - 1);
  }

  function finish(completed) {
    unzoom();
    setOpen(false);
    setRect(null);
    if (user) {
      try {
        localStorage.setItem(doneKey(user.id), "1");
      } catch {
        /* ignore */
      }
      if (!user.user_metadata?.tour_done) supabase.auth.updateUser({ data: { tour_done: true } }).catch(() => {});
    }
    navigate(completed && featured ? `/product/${featured.product.slug}` : startPathRef.current || "/");
  }

  if (!open || !steps[index]) return null;
  const step = steps[index];
  const name = featured?.product?.name?.[document.documentElement.lang] || featured?.product?.name?.ar || "";
  const vars = {
    name,
    percent: featured?.product?.discount_percent ?? "",
    user: user?.user_metadata?.full_name?.split(" ")[0] || "",
  };

  // Caption placement: phones get a bottom sheet; otherwise below the
  // spotlight if there's room, else above it, else centered.
  let cardStyle;
  if (isPhone || !rect || rect.full) {
    cardStyle = null;
  } else {
    const below = rect.top + rect.height + 16;
    const fitsBelow = below + 230 < window.innerHeight;
    const top = fitsBelow ? below : Math.max(16, rect.top - 16 - 230);
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - 190), window.innerWidth - 396);
    cardStyle = { top, left, width: 380 };
  }

  const progress = ((index + 1) / steps.length) * 100;

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-live="polite">
      {/* blocks clicks on the page while touring */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* the spotlight: everything outside it is dimmed */}
      {rect ? (
        <div
          className={`pointer-events-none fixed rounded-2xl ${rect.full ? "" : "ring-2 ring-enzo-goldBright"}`}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: rect.full ? "0 0 0 200vmax rgba(0,0,0,0.25)" : "0 0 0 200vmax rgba(0,0,0,0.74), 0 0 40px 6px rgba(255,210,63,0.35)",
            transition: "top .6s cubic-bezier(.2,.8,.2,1), left .6s cubic-bezier(.2,.8,.2,1), width .6s cubic-bezier(.2,.8,.2,1), height .6s cubic-bezier(.2,.8,.2,1), box-shadow .4s",
          }}
        >
          {!rect.full && <span className="absolute inset-0 animate-ping rounded-2xl ring-2 ring-enzo-goldBright/40" />}
        </div>
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-black/75 transition-opacity" />
      )}

      {/* caption */}
      <div
        className={`fixed z-[81] overflow-hidden border border-enzo-gold/40 bg-enzo-black text-start shadow-2xl transition-all duration-500 ${
          cardStyle
            ? "rounded-2xl"
            : isPhone || !rect || rect.full
              ? rect && !rect.full
                ? "inset-x-0 bottom-0 rounded-t-2xl"
                : "inset-x-4 top-1/2 mx-auto max-w-md -translate-y-1/2 rounded-2xl"
              : "rounded-2xl"
        } ${busy ? "opacity-60" : "opacity-100"}`}
        style={cardStyle || undefined}
      >
        <div className="h-1 bg-enzo-line">
          <div className="h-full bg-enzo-gradient transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div key={index} className="animate-[enzo-rise_0.4s_ease-out_both] p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-enzo-gold">
              {t("tour.stepOf", { step: index + 1, total: steps.length })}
            </p>
            <button type="button" onClick={() => finish(false)} aria-label={t("tour.skip")} className="-m-1 rounded-full p-1 text-enzo-muted hover:bg-white/10 hover:text-enzo-white">
              <X size={17} />
            </button>
          </div>
          <h2 className="mt-1 font-display text-xl uppercase leading-tight">{t(`tour.${step.key}Title`, vars)}</h2>
          <p className="mt-2 text-sm leading-relaxed text-enzo-muted">{t(`tour.${step.key}Text`, vars)}</p>

          <div className="mt-5 flex items-center justify-between gap-2">
            <button type="button" onClick={() => finish(false)} className="text-xs text-enzo-muted underline">
              {t("tour.skip")}
            </button>
            <div className="flex gap-2">
              {index > 0 && (
                <button type="button" onClick={back} disabled={busy} className="flex items-center gap-1 rounded-md border hairline px-3 py-2 text-sm disabled:opacity-40">
                  <ArrowLeft size={15} className="rtl:rotate-180" />
                  {t("tour.back")}
                </button>
              )}
              <button
                type="button"
                onClick={next}
                disabled={busy}
                className="flex items-center gap-1 rounded-md bg-enzo-gradient px-4 py-2 text-sm font-semibold text-enzo-black disabled:opacity-60"
              >
                {index === steps.length - 1 ? t("tour.start") : t("tour.next")}
                {index < steps.length - 1 && <ArrowRight size={15} className="rtl:rotate-180" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
