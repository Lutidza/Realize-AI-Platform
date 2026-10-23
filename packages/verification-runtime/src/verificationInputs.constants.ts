/**
 * @file packages/verification-runtime/src/verificationInputs.constants.ts
 * @version 1.2.1
 * @date 2026-10-23
 * @description Фиксирует общие конфигурационные входы проверки независимо от вызывающего интерфейса.
 */
export const VERIFICATION_AUTOMATIC_INPUTS = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".npmrc",
  ".nvmrc",
  ".node-version",
  "scripts/runtime/readProjectRuntime.config.mjs",
  "scripts/runtime/verify-runtime.mjs",
  "scripts/runtime/verifyProjectRuntimePins.service.mjs",
  ".yarnrc",
  ".yarnrc.yml",
  "tsconfig.json",
  "next.config.ts",
  "next.config.mjs",
  "next.config.js",
  "vitest.config.ts",
  "vitest.config.mts",
  "eslint.config.mjs",
  "prettier.config.mjs",
  ".prettierrc",
  "packages/verification-runtime/package.json",
  "packages/verification-runtime/src",
] as const;
