import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// A single Worker serves the React SPA (static assets) and the Hono API (/api/*).
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
});
