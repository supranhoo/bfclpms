import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Only split heavy on-demand libs. Let Rollup default-handle React/Radix/Router
          // to avoid TDZ / circular-init crashes in production.
          if (id.includes("/xlsx/") || id.includes("\\xlsx\\")) return "xlsx-vendor";
          if (id.includes("jspdf")) return "jspdf-vendor";
          if (id.includes("html2canvas")) return "html2canvas-vendor";
          if (id.includes("recharts") || id.includes("/d3-")) return "charts-vendor";
        },
      },
    },
  },
}));
