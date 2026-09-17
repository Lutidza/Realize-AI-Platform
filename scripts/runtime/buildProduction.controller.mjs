/**
 * @file scripts/runtime/buildProduction.controller.mjs
 * @version 1.0.0
 * @date 2026-09-15
 * @description Запускает полную production-сборку с обязательной предварительной проверкой типов.
 * @see documentation/delivery/01-local-admin-ai.md
 */

import { runProductionBuild } from "./runProductionBuild.service.mjs";

const stopping = new AbortController();
let interruptedExitCode = 1;
const interrupt = () => {
  interruptedExitCode = 130;
  stopping.abort("SIGINT");
};
const terminate = () => {
  interruptedExitCode = 143;
  stopping.abort("SIGTERM");
};
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);
try {
  // Все этапы должны проверять один cwd; альтернативный каталог или режим build не принимается.
  if (process.argv.length > 2)
    throw new Error("npm run build не принимает дополнительные аргументы.");
  const code = await runProductionBuild(process.cwd(), stopping.signal);
  process.exitCode = stopping.signal.aborted ? interruptedExitCode : code;
} catch (error) {
  console.error(
    `[build] ${error instanceof Error ? error.message : "Не удалось запустить сборку."}`,
  );
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", terminate);
}
