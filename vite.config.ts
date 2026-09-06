import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  // The app is served under /app/ (nginx: location /app/ → /var/www/smartsht/app/).
  // Vite injects asset URLs relative to `base`; without this it emits /assets/...
  // (domain root) which 404s under /app/. Must match the deploy path.
  base: "/app/",
  plugins: [
    wasm(),
    react(),
    tailwindcss(),
  ],
  build: {
    // Standard multi-file build: index.html + hashed chunks under assets/.
    //
    // We deliberately do NOT use vite-plugin-singlefile. It inlined the entry
    // into index.html and DELETED the emitted chunk files (deleteInlinedFiles),
    // which broke this app's code-splitting: every lazy import() (dialogs,
    // TemplateGallery, ONNX intentEmbeddings, VersionHistoryPanel, …) and the
    // wasm-bindgen `new URL(..., import.meta.url)` resolved against the document
    // at /app/ instead of /app/assets/ and 404'd in production. A normal build
    // emits correct /app/assets/ URLs and lazy chunks load on demand.
    assetsInlineLimit: 4096, // Vite default: inline tiny assets, keep chunks/wasm external.
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'shared/**/*.test.ts'],
    // Real-engine tests run in the separate integration tier (they need the
    // actual WASM via vitest.integration.config.ts). Exclude them here so the
    // stubbed unit tier doesn't try to run them against the stub.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.realengine.test.ts'],
    // NOTE: the default `vitest run` tier aliases the WASM formula engine to a
    // lightweight STUB (arithmetic + SUM + single refs only). It has no
    // dependency graph, recalc, structural ref rewrites, cross-sheet refs, or
    // #REF! propagation. These unit tests verify app logic, NOT real-engine
    // behavior. Real-engine coverage lives in the separate integration tier:
    //   npx vitest run --config vitest.integration.config.ts
    alias: {
      '@ocean8219/formualizer': new URL('src/__mocks__/@ocean8219/formualizer.stub.ts', import.meta.url).pathname,
    },
  },
  server: {
    proxy: {
      '/health': 'http://127.0.0.1:8787',
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
