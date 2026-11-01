import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.js";
import { defaultsFor } from "../lib/contentManifest.js";
import { usePreviewDrafts } from "../lib/cmsPreview.js";

// Public content loader: fetches the CMS rows for one page and merges
// them over the manifest's hardcoded defaults, so a missing row, an empty
// table, or a failed request never breaks the page -- it just shows the
// default copy/image it always showed before this CMS existed.
//
// Returns a flat `{ [section]: { [key]: value } }` map for that page.
//
// Inside the admin's live preview iframe, the admin's unsaved edits
// (see lib/cmsPreview.js) are layered on top.
export function useContent(page) {
  const { t } = useTranslation("common");
  const [content, setContent] = useState(() => defaultsFor(page, t));

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/content/${page}`)
      .then((data) => {
        if (cancelled) return;
        const merged = defaultsFor(page, t);
        for (const item of data?.items || []) {
          if (item.value == null || item.value === "") continue;
          merged[item.section] = merged[item.section] || {};
          merged[item.section][item.key] = item.value;
        }
        setContent(merged);
      })
      .catch(() => setContent(defaultsFor(page, t)));
    return () => {
      cancelled = true;
    };
  }, [page, t]);

  const drafts = usePreviewDrafts(page);
  if (!drafts) return content;

  // A field cleared in the editor shows its default, same as after saving.
  const defaults = defaultsFor(page, t);
  const withDrafts = { ...content };
  for (const [section, fields] of Object.entries(drafts)) {
    withDrafts[section] = { ...content[section] };
    for (const [key, value] of Object.entries(fields)) {
      withDrafts[section][key] = value == null || value === "" ? defaults[section]?.[key] ?? "" : value;
    }
  }
  return withDrafts;
}
