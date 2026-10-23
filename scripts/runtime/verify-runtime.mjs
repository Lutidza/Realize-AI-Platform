/**
 * @file scripts/runtime/verify-runtime.mjs
 * @version 1.1.0
 * @date 2026-10-23
 * @description Проверяет текущую пару Node/npm и согласованность проектных pins.
 */

import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  projectRoot,
  readProjectRuntime,
} from "./readProjectRuntime.config.mjs";
import { verifyProjectRuntimePins } from "./verifyProjectRuntimePins.service.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--runtime-only"))
    throw new Error(
      "Допускается только --runtime-only для неполного Docker build context.",
    );
  const expected = readProjectRuntime();
  if (process.versions.node !== expected.node)
    throw new Error(
      `Нужен Node.js ${expected.node}; запущен ${process.versions.node}.`,
    );
  // npm run передаёт фактический CLI; проверка не выбирает другой runtime и не создаёт subprocess.
  if (!process.env.npm_execpath)
    throw new Error("Запускайте проверку через npm run verify:runtime.");
  const npm = realpathSync(process.env.npm_execpath);
  if (basename(npm) !== "npm-cli.js")
    throw new Error("npm_execpath должен указывать на npm-cli.js.");
  const npmManifest = JSON.parse(
    readFileSync(resolve(dirname(npm), "../package.json"), "utf8"),
  );
  if (npmManifest.name !== "npm")
    throw new Error("Не удалось подтвердить пакет запущенного npm.");
  const actualNpm = npmManifest.version;
  if (actualNpm !== expected.npm)
    throw new Error(`Нужен npm ${expected.npm}; запущен ${actualNpm}.`);
  if (!args.length) verifyProjectRuntimePins(projectRoot, expected);
  console.log(
    `[runtime] Node.js ${expected.node}; npm ${expected.npm}; ${args.length ? "runtime" : "runtime и pins"}: OK`,
  );
} catch (error) {
  console.error(
    `[runtime] ${error.message}\n[runtime] Настройте интерпретатор и PATH по README.md и повторите npm run verify:runtime.`,
  );
  process.exitCode = 1;
}
