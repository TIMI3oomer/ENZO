import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

// CHECKPOINT NOTE (AuthContext.jsx):
// Handles admin authentication using Supabase Auth (email + password).
// Being logged in is not enough to reach the dashboard — the user's id
// must also exist in the "admin_users" table (checked here via RLS-backed
// query). This double gate matches the schema.sql security model, so a
// customer who somehow creates a Supabase auth account still cannot see
// the admin dashboard or its data.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      checkAdmin(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      checkAdmin(sess);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function checkAdmin(sess) {
    if (!sess?.user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", sess.user.id)
      .maybeSingle();
    setIsAdmin(!!data && !error);
    setLoading(false);
  }

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  // Used by the CUSTOMER-facing register page (src/pages/Register.jsx).
  // full_name is stored in Supabase Auth's user_metadata so Checkout.jsx
  // can prefill it later without a separate "customers" table.
  async function register(email, password, fullName) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error };
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, isAdmin, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
