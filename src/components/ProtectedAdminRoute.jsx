import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// CHECKPOINT NOTE (ProtectedAdminRoute.jsx):
// Client-side gate for UX only (instant redirect, no flash of admin UI).
// The REAL security boundary is the Postgres Row Level Security policies
// in supabase/schema.sql — even if someone bypassed this component, the
// database itself would refuse to return or modify admin-only data.
export default function ProtectedAdminRoute({ children }) {
  const { session, isAdmin, loading } = useAuth();

  if (loading) return <div className="p-10 text-center text-enzo-muted">...</div>;
  if (!session || !isAdmin) return <Navigate to="/admin/login" replace />;

  return children;
}
