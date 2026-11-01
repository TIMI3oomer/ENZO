import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Smartphone, Tablet, Monitor, RotateCw, ExternalLink } from "lucide-react";
import { useLanguage } from "../context/LanguageContext.jsx";
import { PREVIEW_MSG, PREVIEW_READY_MSG } from "../lib/cmsPreview.js";

// Live preview of the storefront for admin/Content.jsx. Renders the real
// site in an iframe at a chosen device width (scaled down to fit the
// panel) and pushes the editor's unsaved `values` into it on every change
// -- see lib/cmsPreview.js for the receiving side.
const DEVICES = [
  { id: "mobile", width: 390, icon: Smartphone },
  { id: "tablet", width: 820, icon: Tablet },
  { id: "desktop", width: 1440, icon: Monitor },
];

const PAGES = [
  { path: "/", label: "preview.pageHome" },
  { path: "/shop", label: "preview.pageShop" },
  { path: "/cart", label: "preview.pageCart" },
];

export default function CmsPreview({ values, dirty }) {
  const { t } = useTranslation("admin");
  const { lang: adminLang } = useLanguage();
  const [device, setDevice] = useState("mobile");
  const [path, setPath] = useState("/");
  const [lang, setLang] = useState(adminLang);
  const [reloadKey, setReloadKey] = useState(0);
  const [boxWidth, setBoxWidth] = useState(0);
  const boxRef = useRef(null);
  const frameRef = useRef(null);

  const deviceWidth = DEVICES.find((d) => d.id === device).width;
  const scale = boxWidth ? Math.min(1, boxWidth / deviceWidth) : 1;

  useLayoutEffect(() => {
    const el = boxRef.current;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Push drafts + language whenever they change...
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: PREVIEW_MSG, values, lang }, window.location.origin);
  }, [values, lang]);

  // ...and again whenever the iframe (re)loads and says it's ready.
  const latest = useRef({ values, lang });
  latest.current = { values, lang };
  useEffect(() => {
    function onMessage(e) {
      if (e.origin !== window.location.origin || e.data?.type !== PREVIEW_READY_MSG) return;
      if (e.source !== frameRef.current?.contentWindow) return;
      e.source.postMessage({ type: PREVIEW_MSG, ...latest.current }, window.location.origin);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const btn = (active) =>
    `flex h-8 items-center justify-center rounded px-2 text-xs ${
      active ? "bg-enzo-white text-enzo-black" : "text-enzo-muted hover:text-enzo-white"
    }`;

  return (
    <div className="flex h-full flex-col rounded-lg border border-enzo-line bg-enzo-panel">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-enzo-line p-2">
        <select
          value={path}
          onChange={(e) => setPath(e.target.value)}
          className="h-8 rounded border border-enzo-line bg-enzo-black px-2 text-xs text-enzo-white"
          aria-label={t("preview.page")}
        >
          {PAGES.map((p) => (
            <option key={p.path} value={p.path}>
              {t(p.label)}
            </option>
          ))}
        </select>

        <div className="flex rounded border border-enzo-line p-0.5">
          {DEVICES.map(({ id, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setDevice(id)} className={btn(device === id)} title={t(`preview.${id}`)}>
              <Icon size={15} />
            </button>
          ))}
        </div>

        <div className="flex rounded border border-enzo-line p-0.5">
          {["ar", "en"].map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} className={`${btn(lang === l)} w-9 font-semibold`}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="ms-auto flex items-center gap-1">
          {dirty && (
            <span className="me-1 rounded-full bg-enzo-gold/15 px-2 py-0.5 text-[11px] text-enzo-gold">
              {t("preview.unsaved")}
            </span>
          )}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={btn(false)} title={t("preview.reload")}>
            <RotateCw size={15} />
          </button>
          <a href={path} target="_blank" rel="noreferrer" className={btn(false)} title={t("preview.openTab")}>
            <ExternalLink size={15} />
          </a>
        </div>
      </div>

      {/* Viewport: the iframe renders at the real device width and is scaled to fit. */}
      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden bg-enzo-black">
        <div
          className="absolute top-0 origin-top"
          style={{
            width: deviceWidth,
            height: `${100 / scale}%`,
            left: "50%",
            transform: `translateX(-50%) scale(${scale})`,
          }}
        >
          <iframe
            key={`${path}-${reloadKey}`}
            ref={frameRef}
            src={path}
            title={t("preview.title")}
            className="h-full w-full border-0 bg-enzo-black"
          />
        </div>
      </div>
    </div>
  );
}
