/**
 * @file packages/verification-runtime/src/readVerificationEnvironment.adapter.ts
 * @version 1.1.1
 * @date 2026-10-23
 * @description Формирует минимальное окружение проверки и его digest без передачи Git authority или plaintext в receipt.
 */
import { dirname, delimiter } from "node:path";
import type {
  VerificationCheck,
  VerificationEnvironment,
} from "./Verification.types.ts";
import { hashVerificationValue } from "./hashVerificationRecipe.util.ts";

export function readVerificationEnvironment(
  check: VerificationCheck,
): VerificationEnvironment {
  const values: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    TZ: "UTC",
    CI: "1",
    npm_config_userconfig: "/dev/null",
    // npm запрещает повторно загружать один config path; дочерний путь устройства не может быть файлом.
    npm_config_globalconfig: "/dev/null/realize-verification-global.npmrc",
  };
  for (const name of check.inheritEnvironment ?? [])
    if (process.env[name] !== undefined) values[name] = process.env[name];
  Object.assign(values, check.environment);
  // npm scripts должны наследовать проверенный Node даже после разрешённых overrides.
  const nodeDirectory = dirname(process.execPath);
  values.PATH = [
    nodeDirectory,
    ...(values.PATH ?? "/usr/bin:/bin")
      .split(delimiter)
      .filter((directory) => directory !== nodeDirectory),
  ].join(delimiter);
  for (const name of Object.keys(values))
    if (name.startsWith("REALIZE_GIT_")) delete values[name];
  return { values, digest: hashVerificationValue(values) };
}
