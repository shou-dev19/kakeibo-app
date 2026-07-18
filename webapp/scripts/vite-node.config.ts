import { defineConfig } from "vite";

// Minimal Vite config used only to run the migration script via vite-node.
// It deliberately loads NO plugins — the Cloudflare / React / Tailwind plugins
// in the root vite.config.ts spin up a dev-server environment that vite-node
// cannot use for a plain Node script.
export default defineConfig({});
