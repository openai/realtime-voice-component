import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const tokenServerOrigin =
  process.env.DEMO_TOKEN_ORIGIN ?? "http://localhost:3211";
const demoRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: demoRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
      {
        find: "realtime-voice-component/styles.css",
        replacement: fileURLToPath(
          new URL("../src/styles.css", import.meta.url),
        ),
      },
      {
        find: "realtime-voice-component",
        replacement: fileURLToPath(new URL("../src/index.ts", import.meta.url)),
      },
    ],
  },
  server: {
    proxy: {
      "/token": tokenServerOrigin,
    },
  },
  build: {
    outDir: fileURLToPath(new URL("../dist/demo", import.meta.url)),
    emptyOutDir: true,
  },
});
