export default {
  plugins: {
    // No postcss-logical: it rewrote Tailwind's logical utilities
    // (text-start, ms-*, start-*, border-e...) into fixed left/right
    // values, which broke them in Arabic (RTL). Every current browser
    // supports logical properties natively, so they're left as-is.
    tailwindcss: {},
    autoprefixer: {},
  },
};
