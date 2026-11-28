import type { Config } from "tailwindcss";

// Design system BOHEMIA OS — fond beige chaud, fiches ivoire, texte charbon, actions vert olive.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: { DEFAULT: "#F1E9DF", 50: "#FBF7F1" },
        // Fiches (cartes) : ivoire un peu plus clair que le fond beige
        paper: { DEFAULT: "#FBF7F1" },
        // Actions principales : vert olive foncé
        olive: { 50: "#F1F2E8", 100: "#E2E5D0", 200: "#C9CEA8", 500: "#6E7541", 600: "#5A6135", 700: "#4A5029", 800: "#3B4021" },
        sand: { 50: "#F7F2EB", 100: "#F1EADF", 200: "#E8DDCF", 300: "#DCCDBA" },
        nude: { 100: "#EFE2D6", 200: "#E3CDBB", 300: "#D4B59D" },
        taupe: { 300: "#B9AC9C", 400: "#A39382", 500: "#8B7D6B", 600: "#706455", 700: "#574D42" },
        ink: { DEFAULT: "#2C2825", 600: "#45423D", 500: "#5E5A54", 400: "#7D786F", 300: "#A29C92" },
        line: { DEFAULT: "#E6DFD4", strong: "#D8CEC0" },
        // Accents chaleureux (plus colorés, restent doux) : par statut, par département, par module
        sage: { 50: "#F2F5EE", 100: "#E3EBD9", 200: "#CCDABB", 400: "#88A372", 500: "#6E8A58", 600: "#5C7549", 700: "#4A5E3B", 800: "#3B4B2F" },
        clay: { 50: "#FCF1EC", 100: "#F7DFD3", 200: "#EEC1AC", 500: "#C46A47", 600: "#A9573A", 700: "#8A452D" },
        ochre: { 50: "#FCF6E9", 100: "#F8EACB", 200: "#EFD59A", 500: "#C9963A", 600: "#A97C2C", 700: "#865F1F" },
        mist: { 50: "#EFF4F8", 100: "#DCE7F0", 200: "#BCD0E0", 500: "#5E86A6", 600: "#4C6F8C", 700: "#3D5A72" },
        rose: { 50: "#FCF1F2", 100: "#F8DFE2", 200: "#F0C2C8", 500: "#C9707E", 600: "#AE5867", 700: "#8C4250" },
        plum: { 50: "#F6F2F9", 100: "#EBE2F3", 200: "#D7C6E7", 500: "#8E6FB0", 600: "#775A97", 700: "#5F4779" },
        teal: { 50: "#EEF6F4", 100: "#D7EBE6", 200: "#B2D7CE", 500: "#4F9585", 600: "#3F7C6E", 700: "#326358" },
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
