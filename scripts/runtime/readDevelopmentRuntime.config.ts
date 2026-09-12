/**
 * @file scripts/runtime/readDevelopmentRuntime.config.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Собирает процессы разработки с единым окружением и проверенными адресами.
 * @see documentation/delivery/01-local-admin-ai.md
 */

import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readControlPlaneConfig } from "../../services/ai-control-plane/src/readControlPlaneConfig.config";
import { readExecutionWorkerConfig } from "../../services/ai-execution-worker/src/config";
import type { DevelopmentRuntime } from "./DevelopmentRuntime.types";

const require = createRequire(import.meta.url);

const optionValue = (
  args: string[],
  short: string,
  long: string,
): string | undefined => {
  let value: string | undefined;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === short || args[index] === long) {
      value = args[++index];
      if (!value || value.startsWith("-"))
        throw new Error(`Не задано значение ${long}.`);
    } else if (args[index].startsWith(`${long}=`))
      value = args[index].slice(long.length + 1);
  }
  return value;
};

/** Central/isolated окружение не получает локальных исполнителей даже при включённом агенте. */
export const readDevelopmentRuntime = (
  sourceEnvironment: NodeJS.ProcessEnv,
  args: string[] = [],
  cwd = process.cwd(),
): DevelopmentRuntime => {
  const environment: NodeJS.ProcessEnv = {
    ...sourceEnvironment,
    NODE_ENV: "development",
  };
  const mode = environment.REALIZE_AI_RUNTIME_MODE || "central-control-plane";
  if (mode !== "local-development" && mode !== "central-control-plane")
    throw new Error(
      "REALIZE_AI_RUNTIME_MODE должен быть local-development или central-control-plane.",
    );
  const local =
    mode === "local-development" &&
    environment.REALIZE_AI_RUNTIME_ISOLATED !== "true";
  const explicitPort = optionValue(args, "-p", "--port");
  const port = Number(explicitPort ?? environment.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("Порт приложения должен быть целым числом от 1 до 65535.");
  const host = optionValue(args, "-H", "--hostname") || "0.0.0.0";
  const webArgs = [require.resolve("next/dist/bin/next"), "dev", ...args];
  // Явный порт отключает автоматический переход Next на соседний порт при конфликте.
  if (explicitPort === undefined) webArgs.push("--port", String(port));
  const runtime: DevelopmentRuntime = {
    cwd,
    environment,
    local,
    processes: [{ name: "web", args: webArgs }],
    ports: [{ name: "web", host, port }],
  };
  if (!local || args.includes("--help") || args.includes("-h")) {
    if (args.includes("--help") || args.includes("-h")) {
      runtime.local = false;
      runtime.ports = [];
    }
    return runtime;
  }
  const control = readControlPlaneConfig(environment);
  if (args.some((argument) => argument.startsWith("--experimental-https")))
    throw new Error(
      "Совместный локальный запуск использует HTTP. Для отдельного HTTPS-приложения используйте npm run dev:web.",
    );
  readExecutionWorkerConfig(environment);
  const authority = control.host === "::1" ? "[::1]" : control.host;
  const url = `http://${authority}:${control.port}`;
  if (
    environment.REALIZE_AI_CONTROL_PLANE_URL &&
    environment.REALIZE_AI_CONTROL_PLANE_URL.replace(/\/$/, "") !== url
  )
    throw new Error(
      "REALIZE_AI_CONTROL_PLANE_URL не совпадает с HOST/PORT локального control plane.",
    );
  environment.REALIZE_AI_CONTROL_PLANE_URL = url;
  if (control.port === port)
    throw new Error("Приложению и control plane нужны разные порты.");
  runtime.ports.push({
    name: "control-plane",
    host: control.host,
    port: control.port,
  });
  const webHost = ["0.0.0.0", "::"].includes(host) ? "127.0.0.1" : host;
  runtime.processes[0].readyUrl = `http://${webHost.includes(":") ? `[${webHost}]` : webHost}:${port}/api/health/live`;
  const serviceArgs = (path: string) => [
    "--import=tsx/esm",
    resolve(cwd, path),
  ];
  runtime.processes.push(
    {
      name: "control-plane",
      args: serviceArgs("services/ai-control-plane/src/server.ts"),
      readyUrl: `${url}/health`,
    },
    {
      name: "execution-worker",
      args: serviceArgs("services/ai-execution-worker/src/worker.ts"),
      drain: true,
    },
  );
  return runtime;
};
