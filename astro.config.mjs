// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://habiibullahm.my.id/",
  integrations: [mdx()],
  devToolbar: { enabled: false },
  vite: {
    build: { assetsInlineLimit: 0 },
    plugins: [tailwindcss()],
  },
});
