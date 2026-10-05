import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Baseline added after the codebase grew without a linter. These rules
    // flag ~110 pre-existing issues, so they warn for now to keep `pnpm lint`
    // usable; promote each back to "error" once its warnings are cleared.
    // Correctness rules such as react-hooks/rules-of-hooks stay as errors.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python services, workers, and generated/vendored code are linted (or
    // not) by their own toolchains, not the Next.js app config.
    "Crawl4AI/**",
    "api/**",
    "cloudflare_workers/**",
    "ai_voice_bulider/**",
    "creative/**",
    "scripts/**",
    "fix.js",
    ".venv/**",
    // Vendored, minified bundles served as static files.
    "public/**",
  ]),
]);
