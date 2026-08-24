import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This dashboard fetches from Supabase in plain useEffect + setState
      // (no data-fetching library). That's the exact pattern this React
      // Compiler rule flags — every "setLoading(true)" at the top of a
      // fetch effect trips it. Disabling rather than restructuring every
      // page around useTransition/useSyncExternalStore for this project's scope.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
