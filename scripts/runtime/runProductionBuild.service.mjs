/**
 * @file scripts/runtime/runProductionBuild.service.mjs
 * @version 1.0.0
 * @date 2026-09-15
 * @description Последовательно генерирует типы, проверяет TypeScript и собирает Next.js отдельными процессами.
 * @see documentation/delivery/01-local-admin-ai.md
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

export const VERIFIED_TYPES_ENVIRONMENT_NAME = "REALIZE_BUILD_TYPES_VERIFIED";

/** @returns {Promise<number>} */
const runStage = (cwd, args, environment, signal) =>
  new Promise((accept) => {
    if (signal.aborted) {
      accept(1);
      return;
    }
    const child = spawn(process.execPath, args, {
      cwd,
      env: environment,
      // Outer checkRunner владеет группой; отделение этапа оставило бы его вне cleanup при timeout.
      detached: false,
      stdio: "inherit",
    });
    let failed = false;
    let escalation;
    const stop = () => {
      child.kill(signal.reason === "SIGINT" ? "SIGINT" : "SIGTERM");
      escalation = setTimeout(() => child.kill("SIGKILL"), 2_000);
    };
    child.once("error", () => {
      failed = true;
    });
    child.once("close", (code, terminationSignal) => {
      clearTimeout(escalation);
      signal.removeEventListener("abort", stop);
      accept(failed || signal.aborted || terminationSignal ? 1 : (code ?? 1));
    });
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
  });

/**
 * Проверка типов обязательна при каждом запуске; флаг относится только к следующему дочернему build.
 * @param {string} cwd
 * @param {AbortSignal} signal
 * @param {NodeJS.ProcessEnv} environment
 * @returns {Promise<number>}
 */
export const runProductionBuild = async (
  cwd,
  signal,
  environment = process.env,
) => {
  if (signal.aborted) return 1;
  const require = createRequire(resolve(cwd, "package.json"));
  const nextCLI = require.resolve("next/dist/bin/next");
  const typeScriptCLI = require.resolve("typescript/bin/tsc");
  const cleanEnvironment = { ...environment, NODE_ENV: "production" };
  delete cleanEnvironment[VERIFIED_TYPES_ENVIRONMENT_NAME];

  const stages = [
    { label: "Генерация типов маршрутов", args: [nextCLI, "typegen"] },
    { label: "Проверка TypeScript", args: [typeScriptCLI, "--noEmit"] },
    {
      label: "Production-сборка Next.js",
      args: [nextCLI, "build", "--webpack"],
    },
  ];
  for (const [index, stage] of stages.entries()) {
    if (signal.aborted) return 1;
    console.log(`[build] ${stage.label}`);
    const stageEnvironment = { ...cleanEnvironment };
    if (index === stages.length - 1)
      stageEnvironment[VERIFIED_TYPES_ENVIRONMENT_NAME] = "1";
    const code = await runStage(cwd, stage.args, stageEnvironment, signal);
    if (code !== 0) return code;
  }
  return 0;
};
