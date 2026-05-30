import { defineConfig } from "vite";

// Fully client-side app — no backend. The PDF never leaves the browser.
export default defineConfig({
  base: "./",
  worker: {
    format: "es",
  },
  build: {
    target: "es2020",
  },
});
