import { supabase } from "./supabaseClient.js";
import i18n from "../i18n/index.js";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// CHECKPOINT NOTE (src/lib/api.js):
// Every read/write of real data (products, orders, admin actions) now
// goes through the Node backend instead of the Supabase client directly.
// The Supabase client (supabaseClient.js) is still used, but ONLY for
// Auth (login/register/session) — never for reading or writing store
// data anymore. This function reads the current Supabase access token (if
// any) and attaches it as a Bearer token so the backend can identify the
// customer/admin making the request.
async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...options.headers,
  };

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch (networkErr) {
    // CHECKPOINT NOTE — this catch is specifically for when `fetch` itself
    // throws, meaning the request never reached the server at all: no
    // internet, the backend is down/asleep, CORS blocked it, VITE_API_URL
    // points at the wrong place, DNS failure, etc. This is the #1 thing
    // that goes wrong right after a fresh deploy (frontend and backend
    // pointing at each other incorrectly), so it gets a clear, translated,
    // actionable message — not a raw "Failed to fetch" the customer can't
    // do anything with. Uses the i18n singleton directly (not a React
    // hook) since this file isn't a component, but still respects
    // whichever language is currently active.
    const err = new Error(i18n.t("errors.network", { ns: "common" }));
    err.isNetworkError = true;
    throw err;
  }

  if (res.status === 204) return null;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.error || i18n.t("errors.generic", { ns: "common" }));
    err.status = res.status;
    throw err;
  }
  return body;
}

export const api = {
  get: (path) => request(path, { method: "GET" }),
  post: (path, data) => request(path, { method: "POST", body: JSON.stringify(data) }),
  put: (path, data) => request(path, { method: "PUT", body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: "PATCH", body: JSON.stringify(data) }),
  del: (path) => request(path, { method: "DELETE" }),
};
