/**
 * @file .ai/tools/git-delivery/src/worker/createGitWorkerTransport.adapter.ts
 * @version 1.1.0
 * @date 2026-11-08
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
  integrationEnvironment?: NodeJS.ProcessEnv,
): GitWorkerTransport {
  return new JsonLineRPCClient({
    workingDirectory,
    // Lease owner уже отфильтровал окружение и назначил scoped auth для выбранного authMode.
    environment:
      integrationEnvironment ?? createGitWorkerEnvironment(sourceEnvironment),
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
