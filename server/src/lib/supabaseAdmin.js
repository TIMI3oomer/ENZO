import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// CHECKPOINT NOTE (server/src/lib/supabaseAdmin.js):
// This is the ONLY place in the whole project that uses the service_role
// key. It bypasses Row Level Security, which is what lets the backend
// (e.g. an admin updating any order, or place_order() adjusting stock on
// products it doesn't "own") do its job. Because it bypasses RLS, this
// file — and this key — must never be imported into anything that ships
// to the browser.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "[ENZO server] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copy server/.env.example to server/.env and fill them in."
  );
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
