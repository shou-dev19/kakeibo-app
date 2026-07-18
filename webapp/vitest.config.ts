import { defineConfig } from "vitest/config";

// Tests run in a plain Node environment. They cover shared logic and schema
// integrity (parsing the SQL migrations) — no Workers runtime required.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
