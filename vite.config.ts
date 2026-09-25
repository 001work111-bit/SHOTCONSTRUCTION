import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * CSP только для production-сборки (её грузит Electron). В dev она не нужна:
 * там инлайновые скрипты и HMR-вебсокет.
 *
 * `shotasset:` — локальная схема для картинок с диска (electron/main.cjs),
 * `https://fonts.*` — веб-шрифт Inter, если он успел подгрузиться.
 */
const PRODUCTION_CSP = [
  "default-src 'self' data: blob: shotasset:",
  // vite-plugin-singlefile инлайнит бандл прямо в HTML
  "script-src 'self' 'unsafe-inline' data: blob:",
  "style-src 'self' 'unsafe-inline' data: https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: shotasset: https:",
  "connect-src 'self' data: blob: shotasset:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function injectCspMeta(): Plugin {
  return {
    name: "shot:inject-csp",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: PRODUCTION_CSP },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Electron грузит dist/index.html по file:// — пути обязаны быть относительными
  base: "./",
  plugins: [react(), tailwindcss(), injectCspMeta(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    target: "chrome120",
    // один файл вместо пачки ассетов — так проще переносить и упаковывать
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 4096,
    reportCompressedSize: false,
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.SHOT_VITE_PORT ?? 5173),
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});
