export default {
  plugins: {
    // postcss-logical lets us safely use margin-inline / inset-inline etc.
    // and makes sure they behave correctly across browsers for RTL/LTR.
    "postcss-logical": {},
    tailwindcss: {},
    autoprefixer: {},
  },
};
