/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // ---- ENZO brand tokens ----
        // Black / white / gold, per brand direction. `error` is kept
        // separate on purpose — it's a semantic color for destructive
        // actions and validation messages (universally understood as
        // "stop/danger"), not part of the decorative brand palette.
        enzo: {
          black: "#0A0A0A",   // page background
          panel: "#161616",   // card / panel background
          line: "#333333",    // hairline borders/dividers — brightened for more presence
          white: "#FAFAF7",   // primary text on black — brighter
          muted: "#A8A89F",   // secondary text
          gold: "#C9A227",    // primary accent (deep gold)
          goldBright: "#FFD23F", // vivid, brighter gold — CTAs/glows/focus
          goldLight: "#E9C46A", // gradient midtone
          goldDark: "#8A6D1F",  // pressed states / borders on gold
          error: "#E5484D",    // destructive actions, validation only
        },
      },
      fontFamily: {
        // English display face: bold, condensed, streetwear energy.
        display: ["'Anton'", "sans-serif"],
        // English body face.
        sans: ["'Inter'", "sans-serif"],
        // Arabic: modern geometric, highly readable, pairs cleanly with Anton/Inter.
        arabic: ["'IBM Plex Sans Arabic'", "sans-serif"],
      },
      backgroundImage: {
        "enzo-gradient": "linear-gradient(135deg, #C9A227 0%, #FFD23F 100%)",
      },
      keyframes: {
        "enzo-marquee": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "enzo-spin-y": {
          "0%": { transform: "rotateY(0deg)" },
          "100%": { transform: "rotateY(360deg)" },
        },
      },
    },
  },
  plugins: [],
};
