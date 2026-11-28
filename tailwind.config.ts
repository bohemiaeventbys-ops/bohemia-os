import type { Config } from "tailwindcss";

// Design system BOHEMIA OS — fond beige chaud, fiches ivoire, texte charbon, actions vert olive.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Palette Bohemia (28 nov) : Forest, Spring, Blueberry, Rose, Sage, Butter sur fond crème.
        ivory: { DEFAULT: "#F6F1EA", 50: "#FDFAF4" },
        paper: { DEFAULT: "#FFFCF6" },
        butter: { DEFAULT: "#FBF5E2" },
        sand: { 50: "#F9F5EE", 100: "#F2ECE2", 200: "#E8E0D2", 300: "#D9CEBD" },
        nude: { 100: "#F5E6E1", 200: "#ECCFC7", 300: "#E0B0A6" },
        taupe: { 300: "#B8B3A6", 400: "#9C978A", 500: "#7F7B70", 600: "#646156", 700: "#4D4B43" },
        ink: { DEFAULT: "#24302A", 600: "#3B4640", 500: "#56605A", 400: "#747C76", 300: "#A2A8A2" },
        line: { DEFAULT: "#E6E0D4", strong: "#D6CEBF" },
        // Forest : actions principales
        olive: { 50: "#EEF2EC", 100: "#DCE5D8", 200: "#BCCBB6", 500: "#4F6B55", 600: "#3B5442", 700: "#2E4434", 800: "#223428" },
        // Spring : validé, bon état
        sage: { 50: "#F1F4EC", 100: "#E2EAD9", 200: "#CAD7BC", 400: "#97AB86", 500: "#7A8F6A", 600: "#647957", 700: "#4F6145", 800: "#3E4D37" },
        // Rouge : avertissements, manques, erreurs
        clay: { 50: "#FDF0EE", 100: "#F9DCD8", 200: "#F0B9B2", 500: "#C7473B", 600: "#AD3A2F", 700: "#8F2E25" },
        // Sage (kaki doux) : en attente, à renseigner (remplace l'ancien jaune)
        ochre: { 50: "#F7F7F0", 100: "#EDEEE2", 200: "#DDDEC9", 300: "#CACBB0", 400: "#B4B693", 500: "#999B76", 600: "#7D7F5D", 700: "#5F6146" },
        // Blueberry : informations, réservé, horaires
        mist: { 50: "#EFF2F7", 100: "#DEE4ED", 200: "#C4CEDC", 500: "#8799B0", 600: "#6D7F98", 700: "#55657C" },
        // Rose : design, événements
        rose: { 50: "#FBF2F0", 100: "#F6E2DD", 200: "#EDCBC3", 300: "#E0B0A6", 500: "#C98F84", 600: "#B0766B", 700: "#8C5A51" },
        plum: { 50: "#F3F2F7", 100: "#E5E3EE", 200: "#CDC9DD", 500: "#8C86AA", 600: "#736D91", 700: "#5B5675" },
        teal: { 50: "#EEF4F1", 100: "#DCE8E2", 200: "#BDD3C9", 500: "#5F8C7C", 600: "#4D7667", 700: "#3E5F53" },
      },
      fontFamily: {
        sans: ['"DM Sans Variable"', "DM Sans", "system-ui", "sans-serif"],
        display: ['"Fraunces Variable"', "Fraunces", "Georgia", "serif"],
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
