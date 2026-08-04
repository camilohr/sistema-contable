import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./tests/test-db.js";

export default defineConfig({
  test: {
    fileParallelism: false,
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      DATABASE_URL: testDatabaseUrl(),
    },
  },
});
