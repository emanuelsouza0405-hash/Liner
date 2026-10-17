import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import path from "path";
import pkg from "./package.json" with { type: "json" };

// BUILD_TARGET=android => build só do front-end (sem plugins do Electron) para o Capacitor.
const isAndroidBuild = process.env.BUILD_TARGET === "android";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(isAndroidBuild
      ? []
      : [
    electron({
      main: {
        entry: "electron/main.ts",
      },
      preload: {
        input: "electron/preload.ts",
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: "cjs",
                entryFileNames: "preload.cjs",
              },
            },
          },
        },
      },
    }),
      ]),
  ],
  clearScreen: false,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "next/navigation": path.resolve(import.meta.dirname, "./src/lib/navigation.tsx"),
      "next/link": path.resolve(import.meta.dirname, "./src/lib/navigation.tsx"),
      "next/image": path.resolve(import.meta.dirname, "./src/components/ui/AppImage.tsx"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: isAndroidBuild ? "chrome100" : undefined,
    chunkSizeWarningLimit: 1500,
  },
});
