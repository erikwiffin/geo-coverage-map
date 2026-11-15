import { defineConfig } from "vite";

export default defineConfig({
  base: "./", // relative paths so web/dist works on GitHub Pages or any static host
  build: { chunkSizeWarningLimit: 1500 },
});
