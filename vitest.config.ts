import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./demo/src", import.meta.url)),
      "@picovoice/porcupine-react": fileURLToPath(
        new URL(
          "./node_modules/@picovoice/porcupine-react/dist/esm/index.js",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"],
    coverage: {
      all: true,
      exclude: ["demo/**", "test/**", "src/types.ts", "src/transport/types.ts"],
      include: ["src/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text", "html"]
    },
  },
});
