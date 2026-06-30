import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import electronRenderer from "vite-plugin-electron-renderer";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            lib: { entry: "electron/main.ts", formats: ["cjs"] },
            rollupOptions: {
              external: ["electron", "better-sqlite3", "path", "fs", "crypto", "url"],
              output: { format: "cjs", entryFileNames: "[name].js" },
            },
          },
        },
      },
      {
        entry: "electron/preload.ts",
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            lib: { entry: "electron/preload.ts", formats: ["cjs"] },
            rollupOptions: {
              external: ["electron"],
              output: { format: "cjs", entryFileNames: "[name].js" },
            },
          },
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
