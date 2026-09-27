import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Content-Security-Policy только для прод-сборки.
 * В dev-режиме Vite (HMR, @vite/client, eval) с CSP ломается,
 * поэтому политику добавляем на этапе build.
 */
const cspPlugin = (): Plugin => ({
  name: "shotc-csp",
  apply: "build",
  transformIndexHtml(html) {
    const csp = [
      "default-src 'self'",
      // single-file бандл инлайнит скрипт и стили
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      // appimg: — кастомный протокол локальных картинок (Electron)
      "img-src 'self' data: blob: appimg:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
    ].join("; ");

    return html.replace(
      "<head>",
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`
    );
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), cspPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Относительные пути — обязательно для загрузки через file:// в Electron
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Electron 31+ → Chromium 126+, можно целиться уверенно
    target: "chrome126",
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 4096,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
