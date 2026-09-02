import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// CHECKPOINT NOTE (ProtectedAdminRoute.jsx):
// There's no separate "admin login" anymore — an admin is just a regular
// account (via /login) that happens to have a row in admin_users. So:
// - Not logged in at all -> send to the normal customer /login, with
//   `from` set so they land back on /admin after signing in.
// - Logged in but NOT an admin -> send home ("/"), not back to /login —
//   showing a login form to someone who's already authenticated would
//   just be confusing; they simply don't have admin access on this
//   account.
// This is a client-side UX convenience only. The REAL security boundary
// is the Postgres Row Level Security policies in supabase/schema.sql and
// the backend's own requireAdmin middleware — even if this component
// were bypassed entirely, the database/API would still refuse to
// return or modify admin-only data.
export default function ProtectedAdminRoute({ children }) {
  const { session, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="p-10 text-center text-enzo-muted">...</div>;
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return children;
}
