import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

// ESLint 9 flat config (Next 16 removed `next lint` and the legacy
// .eslintrc format). Replaces .eslintrc.json:
//   { "extends": "next/core-web-vitals", "root": true }
const eslintConfig = defineConfig([
  ...nextVitals,
  {
    rules: {
      // New in eslint-plugin-react-hooks v7 (pulled in by
      // eslint-config-next 16); none of these rules existed in the
      // previous config (react-hooks v4: rules-of-hooks +
      // exhaustive-deps only). Kept visible as warnings instead of
      // errors so the framework upgrade does not force unrelated
      // refactors across ~40 effect/memo sites; a dedicated cleanup
      // can promote them later. rules-of-hooks stays an error and
      // exhaustive-deps stays a warning, as before.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Outside the old `next lint` scope: it linted only the default
    // dirs (pages/, components/, lib/, src/) — of which only src/
    // exists in this repo. tests/ and the archived pre-ASCEND code
    // were never linted; keep that scope rather than expanding it
    // as a side effect of the framework upgrade.
    "tests/**",
    "archive/**",
    // Generated service worker (built from public/sw.template.js by
    // scripts/generate-sw.js on every build):
    "public/sw.js",
  ]),
]);

export default eslintConfig;
