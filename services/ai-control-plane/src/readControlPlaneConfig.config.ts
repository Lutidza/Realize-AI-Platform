/**
 * @file services/ai-control-plane/src/readControlPlaneConfig.config.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет инфраструктуру локального control plane до запуска процесса.
 */

import { resolve } from "node:path";

/** Общая проверка для отдельного сервиса и совместного запуска окружения. */
export const readControlPlaneConfig = (
  environment: NodeJS.ProcessEnv = process.env,
) => {
  const host = environment.REALIZE_AI_CONTROL_PLANE_HOST || "127.0.0.1";
  const port = Number(environment.REALIZE_AI_CONTROL_PLANE_PORT || 3100);
  const token = environment.REALIZE_AI_CONTROL_PLANE_TOKEN || "";
  if (host !== "127.0.0.1" && host !== "::1")
    throw new Error("The development control plane may only bind to loopback.");
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("Invalid control-plane port.");
  if (token.length < 32)
    throw new Error(
      "REALIZE_AI_CONTROL_PLANE_TOKEN must contain at least 32 characters.",
    );
  return {
    host,
    port,
    token,
    workspaceRoot: resolve(
      environment.REALIZE_AI_WORKSPACE_ROOT || process.cwd(),
    ),
  };
};
