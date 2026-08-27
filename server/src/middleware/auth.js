import { supabaseAdmin } from "../lib/supabaseAdmin.js";

// CHECKPOINT NOTE (server/src/middleware/auth.js):
// The frontend still uses Supabase Auth directly (login/register), but
// every write to real data goes through THIS backend. The frontend sends
// the customer/admin's Supabase access token in an Authorization header;
// this middleware verifies that token with Supabase itself (not just
// trusting whatever the client claims) before attaching req.user.
export async function attachUser(req, _res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    req.user = null;
    return next();
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  req.user = error ? null : data.user;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

// Admin gate: being logged in is not enough — the user's id must also be
// present in the admin_users table, same rule the database's RLS policies
// enforce (see supabase/schema.sql). Checked fresh on every request, never
// cached, so revoking admin access takes effect immediately.
export async function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });

  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (error || !data) return res.status(403).json({ error: "Admin access required" });
  next();
}
