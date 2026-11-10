import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const BPMN =
  /node_modules\/(@bpmn-io\/diagram-js-ui|bpmn-moddle|clsx|diagram-js|diagram-js-direct-editing|didi|domify|htm|ids|inherits-browser|min-dash|min-dom|moddle|moddle-xml|object-refs|path-intersection|preact|saxen|tiny-svg)\//;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: (id) => (BPMN.test(id) ? "bpmn" : undefined),
      },
    },
  },
});
