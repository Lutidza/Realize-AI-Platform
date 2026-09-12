/**
 * @file packages/payload-ai-plugin/src/runtime/resolveRuntimeStatus.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Дополняет состояние интеграции проверкой авторизованного маршрута Control Plane.
 * @see documentation/architecture/codex-integration.md
 */

import type { RuntimeStatusDTO } from "@realize/ai-contracts";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { getControlPlaneClient } from "./getControlPlaneClient";

/** Проверка транспорта не запускает модель и не подтверждает готовность отдельного worker. */
export const resolveRuntimeStatus = async (
  options: SanitizedRealizeAIPluginOptions,
): Promise<RuntimeStatusDTO> => {
  const status: RuntimeStatusDTO = options.runtimeStatus ?? {
    enabled: options.enabled,
    mode: options.runtime.mode,
    ...(options.enabled
      ? {}
      : {
          reason:
            "Административный агент выключен в настройках интеграции Codex.",
        }),
    state: options.enabled ? "ready" : "disabled",
  };
  if (status.state !== "ready") return status;
  if (
    options.runtime.mode === "central-control-plane" &&
    !options.runtime.controlPlaneURL
  )
    return {
      ...status,
      reason: "Адрес сервиса выполнения агента не настроен.",
      state: "unavailable",
    };
  let available = false;
  try {
    available = await getControlPlaneClient(options).health();
  } catch {
    // Ответ не раскрывает транспорт, адреса или секреты Control Plane.
  }
  return available
    ? status
    : {
        ...status,
        reason: "Сервис выполнения агента временно недоступен.",
        state: "unavailable",
      };
};
