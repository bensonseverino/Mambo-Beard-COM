import { defineConfig } from "vite";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    // Array form so entries match in order: the "react-router/dom" subpath
    // must be resolved before the bare "react-router" alias (prefix match
    // would otherwise turn "react-router/dom" into index.mjs/dom).
    alias: [
      {
        find: "react-router/dom",
        replacement: resolve(
          import.meta.dirname,
          "node_modules/react-router/dist/production/dom-export.mjs",
        ),
      },
      {
        find: /^react-router$/,
        replacement: resolve(
          import.meta.dirname,
          "node_modules/react-router/dist/production/index.mjs",
        ),
      },
      {
        // lucide-react's package entry is CJS (dist/cjs/lucide-react.js — the
        // whole ~1500-icon library), which the bundler cannot tree-shake. The
        // package also ships per-icon ESM files behind an icons barrel; mapping
        // the bare specifier there lets Rolldown pull only the icons actually
        // imported (~1 KB each instead of ~90 KiB minified).
        find: "lucide-react",
        replacement: resolve(
          import.meta.dirname,
          "node_modules/lucide-react/dist/esm/icons/index.mjs",
        ),
      },
    ],
  },
  server: {
    host: true,
  },
});
