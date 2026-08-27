import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standard Vite + React setup. No special server config needed.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
