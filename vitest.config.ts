import { defineConfig } from "vitest/config";
import path from "node:path";

// Pruebas automáticas: npm test
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
  },
});
