/**
 * @file packages/payload-ai-plugin/src/chat-context/ownerEngineeringAdmission.service.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Повторно авторизует owner-профиль и выдаёт допуск на конкретный серверный запуск.
 */
import { createHmac } from "node:crypto";
import { realpath } from "node:fs/promises";
import {
  OWNER_ENGINEERING_PROFILE_KEY,
  OWNER_ENGINEERING_GRANT_DOMAIN,
  OWNER_ENGINEERING_GRANT_TTL_MS,
  encodeOwnerEngineeringGrant,
  parseIdentifier,
  type AIChatConfigurationSnapshot,
  type OwnerEngineeringGrant,
  type OwnerEngineeringRunMetadata,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { EndpointError } from "../endpoints/http";
import { readCodexChatSettings } from "../integrations/codex/readCodexChatSettings.service";
import type { SanitizedRealizeAIPluginOptions } from "../types";

/** Право и deployment gates проверяются заново перед каждым новым эффектом. */
export const requireOwnerEngineeringAccess = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions | undefined,
): Promise<string> => {
  if (
    !req.user ||
    !options?.access.canUseOwnerEngineering ||
    !(await options.access.canUseChat({ req })) ||
    !(await options.access.canUseOwnerEngineering({ req }))
  )
    throw new EndpointError(
      "FORBIDDEN",
      "Инженерный режим доступен только владельцу платформы.",
      403,
    );
  if (
    !options.enabled ||
    options.runtime.isolated ||
    options.runtime.mode !== "local-development" ||
    !options.runtime.ownerEngineering?.enabled ||
    !options.runtime.ownerEngineering.osUser
  )
    throw new EndpointError(
      "AI_DISABLED",
      "Инженерный режим выключен для этой установки.",
      409,
    );
  const { tools } = await readCodexChatSettings(req);
  if (!tools.codeChanges || !tools.dataOperations)
    throw new EndpointError(
      "FORBIDDEN",
      "Для инженерного режима должны быть включены изменения кода и операции с данными в настройках чата Codex.",
      403,
    );
  if (!process.env[options.runtime.controlPlaneTokenEnv])
    throw new EndpointError(
      "AI_RUNTIME_UNAVAILABLE",
      "Серверный допуск инженерного режима не настроен.",
      503,
    );
  try {
    return await realpath(options.runtime.ownerEngineering.repositoryRoot);
  } catch {
    throw new EndpointError(
      "AI_RUNTIME_UNAVAILABLE",
      "Корень проекта инженерного режима недоступен.",
      503,
    );
  }
};

/** Зарезервированные engineering workflow нельзя присоединить к обычному chat-профилю. */
export const requireOwnerEngineeringWorkflowProfile = (
  profileKey: string,
  workflowKey: string,
): void => {
  if (
    workflowKey.startsWith(OWNER_ENGINEERING_PROFILE_KEY) &&
    profileKey !== OWNER_ENGINEERING_PROFILE_KEY
  )
    throw new EndpointError(
      "FORBIDDEN",
      "Инженерный процесс требует профиль владельца платформы.",
      403,
    );
};

/** Не превращает обычный профиль в инженерный, даже при полном доступе текущего владельца. */
export const resolveOwnerEngineeringMetadata = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  configuration: AIChatConfigurationSnapshot | undefined,
  actorID: number | string,
): Promise<OwnerEngineeringRunMetadata | undefined> => {
  if (configuration?.compiled.profile.key !== OWNER_ENGINEERING_PROFILE_KEY)
    return undefined;
  const workspaceRoot = await requireOwnerEngineeringAccess(req, options);
  if (String(req.user!.id) !== String(actorID))
    throw new EndpointError(
      "FORBIDDEN",
      "Владелец запуска не совпадает с текущим пользователем.",
      403,
    );
  return {
    mode: "owner-host",
    actorID: parseIdentifier(String(actorID), "actor id"),
    profileKey: OWNER_ENGINEERING_PROFILE_KEY,
    configurationHash: configuration.compiled.compiledContextHash,
    workspaceRoot,
  };
};

/** Подпись создаётся только при dispatch; её нельзя сохранять в runContext или публичном DTO. */
export const createOwnerEngineeringGrant = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  configuration: AIChatConfigurationSnapshot | undefined,
  runID: string,
  actorID: number | string,
): Promise<OwnerEngineeringGrant | undefined> => {
  const metadata = await resolveOwnerEngineeringMetadata(
    req,
    options,
    configuration,
    actorID,
  );
  if (!metadata) return undefined;
  const issuedAt = Date.now();
  const claims: Omit<OwnerEngineeringGrant, "signature"> = {
    schemaVersion: "1.0",
    runID: parseIdentifier(runID, "run id"),
    actorID: metadata.actorID,
    profileKey: metadata.profileKey,
    configurationHash: metadata.configurationHash,
    workspaceRoot: metadata.workspaceRoot,
    issuedAt,
    expiresAt: issuedAt + OWNER_ENGINEERING_GRANT_TTL_MS,
  };
  const secret = process.env[options.runtime.controlPlaneTokenEnv];
  if (!secret)
    throw new EndpointError(
      "AI_RUNTIME_UNAVAILABLE",
      "Серверный допуск инженерного режима не настроен.",
      503,
    );
  return {
    ...claims,
    signature: createHmac("sha256", secret)
      .update(OWNER_ENGINEERING_GRANT_DOMAIN)
      .update(encodeOwnerEngineeringGrant(claims))
      .digest("base64url"),
  };
};
