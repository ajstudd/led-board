import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "app/components/LEDBoard.new.tsx",
    "app/components/LEDBoardLayered.tsx",
    // Compiled output of the physics smoke test (npm run test:physics)
    ".tmp-physics/**",
    "scripts/**",
  ]),
]);

export default eslintConfig;
