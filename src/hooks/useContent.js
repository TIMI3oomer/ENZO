import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.js";
import { defaultsFor } from "../lib/contentManifest.js";

// Public content loader: fetches the CMS rows for one page and merges
// them over the manifest's hardcoded defaults, so a missing row, an empty
// table, or a failed request never breaks the page -- it just shows the
// default copy/image it always showed before this CMS existed.
//
// Returns a flat `{ [section]: { [key]: value } }` map for that page.
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

  return content;
}
