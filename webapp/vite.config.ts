import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// A single Worker serves the React SPA (static assets) and the Hono API (/api/*).
export default defineConfig({
  // Bind to all interfaces (not just IPv6 loopback) so the devcontainer's
  // port forwarding (which connects via IPv4) can reach the dev server.
  server: {
    host: true,
  },
  plugins: [react(), tailwindcss(), cloudflare()],
  build: {
    rollupOptions: {
      output: {
        // Split the heavy charting library (recharts + its d3 deps) and the
        // React runtime into their own chunks so the main app bundle stays
        // small and no chunk trips the default 500 kB size warning.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](recharts|d3-[^/\\]+|victory-vendor|decimal\.js-light|internmap)[\\/]/.test(id)) {
            return "charts";
          }
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return "react-vendor";
          }
          return undefined;
        },
      },
    },
  },
});
