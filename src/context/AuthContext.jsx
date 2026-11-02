import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { api } from "../lib/api.js";

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

    // FIX (admin page stuck on "..."): Supabase documents that calling
    // other Supabase methods INSIDE onAuthStateChange can deadlock its
    // internal auth lock -- it happened after the hourly token refresh or
    // with two tabs open, and the admin check never finished. The callback
    // now only stores the session; the admin check runs right after, on
    // its own turn of the event loop.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setTimeout(() => checkAdmin(sess), 0);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function checkAdmin(sess) {
    if (!sess?.user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    // Ask our own server first (service role -- unaffected by RLS policy
    // changes); fall back to reading admin_users directly if the server
    // can't be reached. Either way `loading` always ends.
    try {
      const { isAdmin: admin } = await api.get("/account/admin-status");
      setIsAdmin(!!admin);
    } catch (err) {
      if (err.status === 401) {
        setIsAdmin(false);
      } else {
        const { data, error } = await supabase
          .from("admin_users")
          .select("user_id")
          .eq("user_id", sess.user.id)
          .maybeSingle();
        setIsAdmin(!!data && !error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  // Google sign-in (also signs new customers up). Checks first that the
  // Google provider is switched on in Supabase -- otherwise Supabase shows
  // the customer a raw JSON error page. Comes back to `returnTo`; that
  // address must be allowed under Supabase -> Authentication -> URL
  // Configuration -> Redirect URLs.
  async function loginWithGoogle(returnTo = "/") {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      });
      const settings = await res.json();
      if (!settings?.external?.google) {
        return { error: { code: "google_disabled", message: "Google sign-in is not enabled" } };
      }
    } catch {
      /* can't tell -- let Supabase handle it */
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${returnTo}` },
    });
    return { error };
  }

  // Sends the "confirm your email" message again (Login/Register pages).
  async function resendConfirmation(email) {
    const { error } = await supabase.auth.resend({ type: "signup", email });
    return { error };
  }

  // Used by the CUSTOMER-facing register page (src/pages/Register.jsx).
  // full_name is stored in Supabase Auth's user_metadata so Checkout.jsx
  // can prefill it later without a separate "customers" table.
  async function register(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    // No session back = Supabase wants the email confirmed first.
    return { error, needsConfirmation: !error && !data.session };
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, isAdmin, loading, login, logout, register, loginWithGoogle, resendConfirmation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
