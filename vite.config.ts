import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import wasm from "vite-plugin-wasm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    wasm(),
    react(),
    tailwindcss(),
    viteSingleFile({
      // Inline main JS/CSS into index.html, but don't base64-encode large WASM binaries.
      deleteInlinedFiles: true,
      // Override the plugin's default assetsInlineLimit to prevent 70MB WASM
      // binary from being inlined into worker JS chunks.
      overrideConfig: {
        build: {
          assetsInlineLimit: 100_000, // Only inline assets < 100KB
        },
      },
    }),
  ],
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
