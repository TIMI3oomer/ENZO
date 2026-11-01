import { useEffect, useState } from "react";
import { api } from "./api.js";

// Which payment methods the backend currently offers (GET /api/config).
// Until the answer arrives -- or if the request fails -- only cash on
// delivery is assumed, which is always available, so checkout never shows a
// method that might not work.
const FALLBACK = { cod: true, card: false, reflect: { enabled: false, phone: "", accountName: "" } };

let cached = null;

export function usePaymentConfig() {
  const [config, setConfig] = useState(cached || FALLBACK);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    api
      .get("/config")
      .then((res) => {
        cached = res?.payments || FALLBACK;
        if (!cancelled) setConfig(cached);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
