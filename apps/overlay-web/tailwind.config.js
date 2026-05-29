/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Bebas Neue", "Arial Narrow", "sans-serif"],
        heading: ["Rajdhani", "Segoe UI", "sans-serif"],
        body: ["Inter", "Segoe UI", "sans-serif"],
      },
      colors: {
        draft: {
          bg: "rgb(var(--draft-bg) / <alpha-value>)",
          panel: "rgb(var(--draft-panel) / <alpha-value>)",
          "panel-deep": "rgb(var(--draft-panel-deep) / <alpha-value>)",
          card: "rgb(var(--draft-card) / <alpha-value>)",
          border: "rgb(var(--draft-border) / <alpha-value>)",
          accent: "rgb(var(--draft-accent) / <alpha-value>)",
          "accent-soft": "rgb(var(--draft-accent-soft) / <alpha-value>)",
          highlight: "rgb(var(--draft-highlight) / <alpha-value>)",
          muted: "rgb(var(--draft-muted) / <alpha-value>)",
          text: "rgb(var(--draft-text) / <alpha-value>)",
          "timer-label": "rgb(var(--draft-timer-label) / <alpha-value>)",
        },
      },
      boxShadow: {
        "broadcast-panel":
          "0 8px 32px rgb(0 0 0 / 0.5), inset 0 1px 0 rgb(255 255 255 / 0.05)",
        "broadcast-glow":
          "0 0 24px rgb(var(--draft-accent) / 0.15), inset 0 1px 0 rgb(255 255 255 / 0.04)",
      },
    },
  },
  plugins: [],
};
