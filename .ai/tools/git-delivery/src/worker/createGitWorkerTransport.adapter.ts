/**
 * @file .ai/tools/git-delivery/src/worker/createGitWorkerTransport.adapter.ts
 * @version 1.0.1
 * @date 2026-09-12
 * @description Подключает общий транспорт Codex с ограничениями возможностей Git-воркера.
 */

import { JsonLineRPCClient } from "@realize/codex-adapter/rpc";
import { createGitWorkerEnvironment } from "./createGitWorkerEnvironment.adapter.ts";
import { GIT_WORKER_CONFIG } from "./gitWorker.config.ts";
import type {
  GitWorkerDependencies,
  GitWorkerTransport,
} from "./GitWorker.types.ts";

export function createGitWorkerTransport(
  workingDirectory: string,
  options: Parameters<GitWorkerDependencies["createTransport"]>[0],
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
): GitWorkerTransport {
  return new JsonLineRPCClient({
    workingDirectory,
    environment: createGitWorkerEnvironment(sourceEnvironment),
    args: [
      "app-server",
      "--listen",
      "stdio://",
      "--strict-config",
      ...Object.entries(GIT_WORKER_CONFIG).flatMap(([key, value]) => [
        "-c",
        `${key}=${JSON.stringify(value)}`,
      ]),
    ],
    signal: options.signal,
    onRequest: options.onRequest,
  });
}
