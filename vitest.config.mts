import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "src/lib/payroll.ts",
        "src/lib/timezone.ts",
        "src/lib/geo.ts",
        "src/lib/audit-crypto.ts",
        "src/lib/audit-verifier.ts",
        "src/lib/attendance-analytics.ts",
        "src/lib/webview-detect.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
