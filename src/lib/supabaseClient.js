import { createClient } from "@supabase/supabase-js";

// -----------------------------------------------------------------------
// CHECKPOINT NOTE — UPDATED
// File: src/lib/supabaseClient.js
//
// This client is now used ONLY for Supabase Auth (login, register,
// session, password reset) via AuthContext.jsx. All actual store data —
// products, categories, orders, admin actions — goes through the Node
// backend instead (see src/lib/api.js), which uses the service_role key
// server-side and enforces its own admin checks + validation. Row Level
// Security policies in supabase/schema.sql are kept as a second,
// independent safety net, not the primary gate anymore.
//
// 1. Create a project at https://supabase.com
// 2. Run supabase/schema.sql, then migration_v2.sql, then migration_v3.sql
//    in the SQL editor.
// 3. Copy your Project URL and anon/public key into .env (frontend) —
//    see .env.example. The service_role key goes in server/.env instead,
//    NEVER here.
// -----------------------------------------------------------------------
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly in dev instead of silently breaking every data call.
  console.error(
    "[ENZO] Missing Supabase env vars. Copy .env.example to .env and fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the admin session in localStorage so refreshing the admin
    // dashboard doesn't log the store owner out.
    persistSession: true,
    autoRefreshToken: true,
  },
});
