/**
 * @file .ai/tools/task-workspace/eslint.config.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Проверяет JavaScript и TypeScript инструмента отдельно от исключений корневого Next.js ESLint.
 * @see documentation/specifications/task-management-execution.md
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  {
    files: ["**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: { globals: globals.node },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),
];
