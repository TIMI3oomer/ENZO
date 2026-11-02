import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Libraries in their own files: they rarely change, so after a new
        // deploy returning visitors keep them cached and only re-download
        // the (small) app code.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          i18n: ["i18next", "react-i18next"],
        },
      },
    },
  },
});
