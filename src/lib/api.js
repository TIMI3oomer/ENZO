import { supabase } from "./supabaseClient.js";

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

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 204) return null;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`);
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
