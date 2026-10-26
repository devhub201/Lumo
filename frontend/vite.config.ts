// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     Nitro, VITE_* env injection, @ path alias, React/TanStack dedupe, error logger plugins,
//     and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    server: {
      allowedHosts: true,
      proxy: {
        "/api": {
          target: process.env["LUMO_DEV_API_ORIGIN"] ?? "http://127.0.0.1:3000",
          changeOrigin: true,
        },
        "/manus-storage": {
          target: process.env["LUMO_DEV_API_ORIGIN"] ?? "http://127.0.0.1:3000",
          changeOrigin: true,
        },
      },
    },
  },
  nitro: { preset: "node-server" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
