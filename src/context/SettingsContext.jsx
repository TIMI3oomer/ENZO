import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api.js";

const SettingsContext = createContext(null);

// CHECKPOINT NOTE (context/SettingsContext.jsx):
// Fetches store-wide settings (delivery fee, currency symbol) ONCE when
// the app loads, rather than every component that needs to show a price
// making its own request. admin/Settings.jsx is what lets the store
// owner change these values; every price display elsewhere (ProductCard,
// Cart, Checkout, etc.) reads from here via useSettings() so they all
// stay in sync automatically.
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ delivery_fee: 0, currency_symbol: "₪" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/settings")
      .then((data) => setSettings(data))
      .catch(() => {}) // keep sane defaults if this fails -- never block the whole app over it
      .finally(() => setLoading(false));
  }, []);

  return (
    <SettingsContext.Provider value={{ ...settings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
