import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["build/**", "dist/**", "frontend/core.js", "reports/**", ".codex-remote-attachments/**"],
  },
  {
    files: ["frontend/app.js"],
    ...eslint.configs.recommended,
    languageOptions: {
      globals: {
        ...globals.browser,
        CONFIG: "readonly",
      },
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    ...eslint.configs.recommended,
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["frontend/src/**/*.ts", "tests/**/*.ts", "supabase/functions/**/*.ts"],
  })),
  {
    files: ["frontend/src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
  },
  {
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.es2022,
        Deno: "readonly",
      },
    },
  },
);
