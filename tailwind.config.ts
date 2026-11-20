import type { Config } from "tailwindcss";

// Design system BOHEMIA OS — palette naturelle : blanc cassé, beige, nude, taupe, anthracite.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: { DEFAULT: "#FAF7F2", 50: "#FDFBF8" },
        sand: { 50: "#F7F2EB", 100: "#F1EADF", 200: "#E8DDCF", 300: "#DCCDBA" },
        nude: { 100: "#EFE2D6", 200: "#E3CDBB", 300: "#D4B59D" },
        taupe: { 300: "#B9AC9C", 400: "#A39382", 500: "#8B7D6B", 600: "#706455", 700: "#574D42" },
        ink: { DEFAULT: "#2B2926", 600: "#45423D", 500: "#5E5A54", 400: "#7D786F", 300: "#A29C92" },
        line: { DEFAULT: "#E6DFD4", strong: "#D8CEC0" },
        sage: { 100: "#E7EBDF", 500: "#7A8A69", 700: "#566349" },
        clay: { 100: "#F3E2D9", 500: "#B4694C", 700: "#8A4A33" },
        ochre: { 100: "#F4EAD3", 500: "#B98F3E", 700: "#8A6826" },
        mist: { 100: "#E5EAEE", 500: "#6B7F90", 700: "#4D5E6C" },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"],
        display: ['"Cormorant Garamond"', "Georgia", "serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(43, 41, 38, 0.04), 0 1px 1px rgba(43, 41, 38, 0.02)",
        pop: "0 12px 32px -8px rgba(43, 41, 38, 0.18), 0 2px 6px rgba(43, 41, 38, 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
