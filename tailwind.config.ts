import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm "Claude" palette pulled from the soundn't logo:
        // parchment cream bg, espresso wordmark text, coral accent.
        bg: "#f4eedb", // warm parchment (logo background)
        surface: "#fbf6e9", // lifted warm card
        elevated: "#fffcf4", // brightest warm surface
        border: "rgba(58,43,36,0.12)", // espresso hairline
        hairline: "rgba(58,43,36,0.07)",
        fg: "#3a2b24", // espresso (logo wordmark)
        muted: "#6e5d52", // warm brown-grey
        faint: "#9c8a7c",
        // `teal` token name kept for compatibility — now the warm coral accent
        // (the crossed-fingers skin tone in the logo / Claude's signature coral).
        teal: {
          DEFAULT: "#d97757",
          fg: "#fff7f0",
          dim: "#c15f3c",
        },
        danger: "#c0483b",
        warn: "#b7791f",
      },
      fontFamily: {
        // Fancy soft serif for titles/headings.
        display: [
          "var(--font-display)",
          "ui-serif",
          "Georgia",
          "serif",
        ],
        sans: [
          "var(--font-sans)",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        lg: "12px",
        md: "10px",
        sm: "8px",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
