/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "var(--color-base)",
        surface: {
          DEFAULT: "var(--color-surface)",
          2: "var(--color-surface-2)",
          3: "var(--color-surface-3)",
        },
        line: "var(--color-line)",
        ink: {
          DEFAULT: "var(--color-ink)",
          muted: "var(--color-ink-muted)",
          faint: "var(--color-ink-faint)",
        },
        primary: {
          DEFAULT: "var(--color-primary)",
          bright: "var(--color-primary-bright)",
          soft: "var(--color-primary-soft)",
        },
        success: "var(--color-success)",
        danger: "var(--color-danger)",
        gold: "var(--color-gold)",
      },
    },
  },
  plugins: [],
};
