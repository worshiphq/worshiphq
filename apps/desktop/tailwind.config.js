/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#f4f4f7",
        surface: {
          DEFAULT: "#ffffff",
          2: "#f8f8fb",
          3: "#ededf2",
        },
        line: {
          DEFAULT: "#e2e2ea",
          soft: "#f0f0f5",
        },
        ink: {
          DEFAULT: "#1a1a2e",
          muted: "#6b6b80",
          faint: "#9c9cb0",
        },
        primary: {
          DEFAULT: "#6D5EF8",
          bright: "#7c6fff",
          soft: "rgba(109, 94, 248, 0.08)",
        },
        success: "#22c55e",
        danger: "#ef4444",
        gold: "#f59e0b",
        info: "#3b82f6",
        sky: "#0ea5e9",
      },
    },
  },
  plugins: [],
};
