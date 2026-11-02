import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";
import { api } from "../../lib/api.js";
import { uploadContentImage } from "../../lib/upload.js";
import { SCALAR_FIELDS, CMS_PAGES, defaultsFor } from "../../lib/contentManifest.js";
import AdminLayout from "../../components/AdminLayout.jsx";
import CmsPreview from "../../components/CmsPreview.jsx";

// CHECKPOINT NOTE (admin/Content.jsx):
// Manifest-driven editor -- this page doesn't know about "hero" or
// "footer" specifically, it just renders whatever's listed in
// src/lib/contentManifest.js, grouped by page then section. Add a field
// to that manifest and it shows up here automatically, no change needed
// in this file.
//
// Each field loads pre-filled with its CURRENT effective value (the
// admin's saved override, or the manifest default if none exists yet) --
// not a blank box -- so hitting Save with no edits is always safe and
// just confirms the current text/image as the explicit override.
//
// The right-hand panel is a live preview of the real storefront that
// shows every edit as it's typed, before saving (components/CmsPreview.jsx).
export default function AdminContent() {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation("common");
  const [values, setValues] = useState({});
  const [savedValues, setSavedValues] = useState({}); // what's in the database, to flag unsaved pages
  const [loading, setLoading] = useState(true);
  const [savingPage, setSavingPage] = useState(null);
  const [savedPage, setSavedPage] = useState(null);
  const [uploadingKey, setUploadingKey] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all(
      CMS_PAGES.map((page) =>
        api
          .get(`/content/${page}`)
          .then((data) => [page, data])
          .catch(() => [page, null])
      )
    ).then((results) => {
      const next = {};
      for (const [page, data] of results) {
        const merged = defaultsFor(page, tc);
        for (const item of data?.items || []) {
          if (item.value == null) continue;
          merged[item.section] = merged[item.section] || {};
          merged[item.section][item.key] = item.value;
        }
        next[page] = merged;
      }
      setValues(next);
      setSavedValues(next);
      setLoading(false);
    });
  }, [tc]);

  function setFieldValue(page, section, key, value) {
    setValues((v) => ({
      ...v,
      [page]: { ...v[page], [section]: { ...v[page]?.[section], [key]: value } },
    }));
  }

  async function handleImageUpload(page, section, key, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fieldKey = `${page}.${section}.${key}`;
    setUploadingKey(fieldKey);
    setError("");
    try {
      const url = await uploadContentImage(file);
      setFieldValue(page, section, key, url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingKey(null);
      e.target.value = "";
    }
  }

  async function handleSave(page) {
    setSavingPage(page);
    setSavedPage(null);
    setError("");
    try {
      const items = SCALAR_FIELDS.filter((f) => f.page === page).map((f) => ({
        section: f.section,
        key: f.key,
        value: values[page]?.[f.section]?.[f.key] ?? "",
      }));
      await api.put(`/admin/content/${page}`, { items, collections: [] });
      setSavedPage(page);
      setSavedValues((v) => ({ ...v, [page]: values[page] }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPage(null);
    }
  }

  // Arabic labels for the manifest's (English) field labels; falls back to
  // the manifest label when there's no translation.
  const fieldLabels = t("content.fields", { returnObjects: true, defaultValue: {} }) || {};

  const isDirty = (page) => JSON.stringify(values[page]) !== JSON.stringify(savedValues[page]);

  if (loading) {
    return (
      <AdminLayout title={t("content.title")}>
        <p className="text-sm text-enzo-muted">...</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={t("content.title")}>
      <p className="mb-6 max-w-2xl text-sm text-enzo-muted">{t("content.intro")}</p>

      {error && <p className="mb-4 text-sm text-enzo-error">{error}</p>}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col gap-8">
        {CMS_PAGES.map((page) => {
          const fields = SCALAR_FIELDS.filter((f) => f.page === page);
          const sections = [...new Set(fields.map((f) => f.section))];
          return (
            <div key={page} className="rounded-lg border border-enzo-line bg-enzo-panel p-6">
              <h2 className="mb-4 font-display text-lg">{t(`content.page_${page}`, page)}</h2>

              <div className="flex flex-col gap-4">
                {sections.map((section) => (
                  <div key={section} className="flex flex-col gap-4 border-t border-enzo-line pt-4 first:border-t-0 first:pt-0">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-enzo-gold">
                    {t(`content.section_${section}`, section)}
                  </h3>
                  {fields
                    .filter((f) => f.section === section)
                    .map((field) => {
                      const value = values[page]?.[section]?.[field.key] ?? "";
                      const fieldKey = `${page}.${section}.${field.key}`;
                      return (
                        <div
                          key={fieldKey}
                          className={field.type === "toggle" ? "flex items-center justify-between gap-3" : undefined}
                        >
                          <label className={`block text-sm font-medium text-enzo-muted ${field.type === "toggle" ? "" : "mb-1"}`}>
                            {fieldLabels[`${section}.${field.key}`] || field.label}
                          </label>
                          {field.type === "image" ? (
                            <div className="flex flex-wrap items-center gap-3">
                              {value && (
                                <img
                                  src={value}
                                  alt=""
                                  className={field.key === "logo" ? "h-14 w-14 rounded-full object-cover" : "h-16 w-28 rounded object-cover"}
                                />
                              )}
                              <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-enzo-line px-4 py-2 text-sm text-enzo-muted hover:border-enzo-goldBright hover:text-enzo-white">
                                <Upload size={16} />
                                {uploadingKey === fieldKey ? "..." : t("products.uploadImages")}
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                                  className="hidden"
                                  disabled={uploadingKey === fieldKey}
                                  onChange={(e) => handleImageUpload(page, section, field.key, e)}
                                />
                              </label>
                              {value && field.key !== "logo" && (
                                <button
                                  type="button"
                                  onClick={() => setFieldValue(page, section, field.key, "")}
                                  className="text-sm text-enzo-muted underline hover:text-enzo-error"
                                >
                                  {t("content.removeImage")}
                                </button>
                              )}
                            </div>
                          ) : field.type === "select" ? (
                            <select
                              className="input"
                              value={value}
                              onChange={(e) => setFieldValue(page, section, field.key, e.target.value)}
                            >
                              {field.options.map((o) => (
                                <option key={o} value={o}>
                                  {t(`content.option_${o}`, o)}
                                </option>
                              ))}
                            </select>
                          ) : field.type === "toggle" ? (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={value !== "off"}
                              onClick={() => setFieldValue(page, section, field.key, value === "off" ? "on" : "off")}
                              className={`relative h-6 w-11 rounded-full transition-colors ${
                                value === "off" ? "bg-enzo-line" : "bg-enzo-gold"
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 h-5 w-5 rounded-full bg-enzo-white transition-all ${
                                  value === "off" ? "start-0.5" : "start-[1.375rem]"
                                }`}
                              />
                            </button>
                          ) : (
                            <textarea
                              className="input"
                              rows={field.key === "invoiceNote" || field.key === "address" ? 2 : 1}
                              value={value}
                              onChange={(e) => setFieldValue(page, section, field.key, e.target.value)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSave(page)}
                  disabled={savingPage === page}
                  className="rounded-md bg-enzo-gradient px-5 py-2 text-sm font-semibold text-enzo-black disabled:opacity-40"
                >
                  {t("content.save")}
                </button>
                {isDirty(page) ? (
                  <span className="text-sm text-enzo-muted">{t("preview.unsaved")}</span>
                ) : (
                  savedPage === page && <span className="text-sm text-enzo-gold">{t("content.saved")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="h-[75vh] xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)]">
        <CmsPreview values={values} dirty={CMS_PAGES.some(isDirty)} />
      </div>
      </div>
    </AdminLayout>
  );
}
