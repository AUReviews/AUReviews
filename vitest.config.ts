import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    server: {
      deps: {
        // next-auth is ESM and deep-imports `next/server` / `next/headers`
        // without extensions, which Node's own loader can't resolve outside
        // Next. Inlining lets Vite resolve them, so the auth round-trip test
        // (exchange.roundtrip.test.ts) can drive the real library.
        inline: ["next-auth"],
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
