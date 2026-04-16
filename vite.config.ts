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

          // Heavy export libs — separate chunks, ideally only loaded on demand
          if (id.includes("xlsx")) return "xlsx-vendor";
          if (id.includes("jspdf")) return "jspdf-vendor";
          if (id.includes("html2canvas")) return "html2canvas-vendor";

          // Charts — only loaded by report pages
          if (id.includes("recharts") || id.includes("d3-")) return "charts-vendor";

          // React core
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/scheduler/")
          ) {
            return "react-vendor";
          }

          // Radix UI + UI primitives
          if (
            id.includes("@radix-ui") ||
            id.includes("lucide-react") ||
            id.includes("cmdk") ||
            id.includes("sonner") ||
            id.includes("vaul") ||
            id.includes("class-variance-authority") ||
            id.includes("clsx") ||
            id.includes("tailwind-merge")
          ) {
            return "ui-vendor";
          }

          // Data layer
          if (id.includes("@tanstack/react-query") || id.includes("@supabase")) {
            return "data-vendor";
          }

          // Forms
          if (
            id.includes("react-hook-form") ||
            id.includes("@hookform") ||
            id.includes("/zod/")
          ) {
            return "forms-vendor";
          }

          // Date handling
          if (id.includes("date-fns") || id.includes("react-day-picker")) {
            return "date-vendor";
          }

          // Everything else node_modules → stable vendor chunk
          return "vendor";
        },
      },
    },
  },
}));
