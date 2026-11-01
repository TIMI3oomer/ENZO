import { useEffect, useSyncExternalStore } from "react";

// Live preview bridge for the CMS (admin/Content.jsx).
//
// The admin's Content page shows the real storefront in an <iframe>. While
// the admin types, it postMessage()s the UNSAVED values into that iframe;
// the storefront running inside it keeps them in the small store below and
// useContent() renders them over the saved content. Nothing is written to
// the database until the admin hits Save, and customers never see drafts:
// preview mode only exists inside a same-origin iframe, and messages from
// any other origin are ignored.

export const PREVIEW_MSG = "enzo-cms-preview";
export const PREVIEW_READY_MSG = "enzo-cms-preview-ready";

export const isCmsPreview = (() => {
  try {
    return window.self !== window.top && window.parent.location.origin === window.location.origin;
  } catch {
    return false; // cross-origin parent -- not our admin
  }
})();

let drafts = {}; // { [page]: { [section]: { [key]: value } } }
const listeners = new Set();

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Draft values for one page (or undefined outside preview mode).
export function usePreviewDrafts(page) {
  return useSyncExternalStore(subscribe, () => (isCmsPreview ? drafts[page] : undefined));
}

// Mounted once inside the storefront: receives drafts + language from the
// admin page and tells it when the iframe is ready to receive them.
export function useCmsPreviewBridge(setLang) {
  useEffect(() => {
    if (!isCmsPreview) return;

    function onMessage(e) {
      if (e.origin !== window.location.origin || e.data?.type !== PREVIEW_MSG) return;
      if (e.data.values) {
        drafts = e.data.values;
        listeners.forEach((fn) => fn());
      }
      if (e.data.lang) setLang(e.data.lang);
    }

    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: PREVIEW_READY_MSG }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [setLang]);
}
