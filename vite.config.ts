import { defineConfig } from "vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: "./.inlang",
      outdir: "./src/paraglide",
    }),
    solid(),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
