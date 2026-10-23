/**
 * @file packages/payload-ai-plugin/src/chat-context/readOwnerEngineeringTarget.service.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Раскрывает проверенному владельцу фактическую цель исполнения из control plane.
 * @see documentation/architecture/codex-integration.md
 */
import type { AIChatConfigurationCatalogDTO } from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { getControlPlaneClient } from "../runtime/getControlPlaneClient";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { requireOwnerEngineeringAccess } from "./ownerEngineeringAdmission.service";

/** Ошибка readiness оставляет обычные профили доступными; публичный ответ не содержит stateRoot или credentials. */
export const readOwnerEngineeringTarget = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
): Promise<AIChatConfigurationCatalogDTO["ownerEngineering"]> => {
  try {
    const root = await requireOwnerEngineeringAccess(req, options);
    const status =
      await getControlPlaneClient(options).ownerEngineeringStatus();
    if (
      !status ||
      typeof status !== "object" ||
      Array.isArray(status) ||
      !("ownerEngineering" in status)
    )
      return null;
    const target = status.ownerEngineering;
    if (
      !target ||
      typeof target !== "object" ||
      Array.isArray(target) ||
      !("enabled" in target) ||
      target.enabled !== true ||
      !("mode" in target) ||
      target.mode !== "owner-host" ||
      !("workspaceRoot" in target) ||
      target.workspaceRoot !== root ||
      !("osUser" in target) ||
      typeof target.osUser !== "string" ||
      target.osUser !== options.runtime.ownerEngineering?.osUser ||
      !("hostname" in target) ||
      typeof target.hostname !== "string" ||
      !/^[A-Za-z0-9._-]{1,253}$/.test(target.hostname)
    )
      return null;
    return {
      enabled: true,
      mode: "owner-host",
      hostname: target.hostname,
      osUser: target.osUser,
      workspaceRoot: root,
    };
  } catch {
    return null;
  }
};
