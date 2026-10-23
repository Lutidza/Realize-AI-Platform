/**
 * @file packages/payload-ai-plugin/src/chat-context/resolveAIChatConfiguration.service.ts
 * @version 1.2.0
 * @date 2026-10-23
 * @description Разрешает активный immutable выпуск и фиксирует выбранный профиль для нового запуска.
 */
import type {
  AIChatConfigurationSelection,
  AIChatConfigurationSnapshot,
  AIChatConfigurationCatalogDTO,
} from "@realize/ai-contracts";
import {
  compileAgentConfiguration,
  SYSTEM_AI_CONFIG_PROJECTION,
  parseAIChatConfigurationSnapshot,
  buildAIChatConfigurationInstructions,
} from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { AIConfigRepository } from "../endpoints/aiConfigRepository";
import { toActiveAIConfigPointerDTO } from "../endpoints/aiConfigPointerMapper";
import { toAIConfigReleaseDTO } from "../endpoints/aiConfigReleaseMapper";
import { EndpointError } from "../endpoints/http";
import { OWNER_ENGINEERING_PROFILE_KEY } from "@realize/ai-contracts";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { requireOwnerEngineeringAccess } from "./ownerEngineeringAdmission.service";

const readActive = async (req: PayloadRequest) => {
  const repository = new AIConfigRepository(req.payload, req);
  const pointer = toActiveAIConfigPointerDTO(
    await repository.getActivePointer(),
  );
  if (!pointer) return undefined;
  const release = toAIConfigReleaseDTO(
    await repository.requireRelease(pointer.releaseID),
  );
  if (release.manifestHash !== pointer.manifestHash)
    throw new EndpointError(
      "CONFLICT",
      "Активный выпуск не прошёл проверку целостности. Обратитесь к администратору конфигурации.",
      409,
    );
  return { pointer, release };
};

/** Проекция доступна пользователю чата; содержимое drafts и инструкций не выдаётся. */
export const readAIChatConfigurationCatalog = async (
  req: PayloadRequest,
  options?: SanitizedRealizeAIPluginOptions,
): Promise<AIChatConfigurationCatalogDTO> => {
  const active = await readActive(req);
  if (!active) return { activePointer: null, release: null, profiles: [] };
  let ownerEngineeringAllowed = false;
  if (
    active.release.artifacts.some(
      ({ artifact }) =>
        artifact.kind === "agent_profile" &&
        artifact.key === OWNER_ENGINEERING_PROFILE_KEY &&
        artifact.enabled,
    )
  ) {
    try {
      await requireOwnerEngineeringAccess(req, options);
      ownerEngineeringAllowed = true;
    } catch {
      /* Недоступный профиль не раскрывается другим пользователям каталога. */
    }
  }
  const profiles = active.release.artifacts.flatMap(({ artifact }) => {
    if (artifact.kind !== "agent_profile" || !artifact.enabled) return [];
    if (
      artifact.key === OWNER_ENGINEERING_PROFILE_KEY &&
      !ownerEngineeringAllowed
    )
      return [];
    try {
      compileAgentConfiguration({
        release: active.release,
        system: SYSTEM_AI_CONFIG_PROJECTION,
        profileKey: artifact.key,
      });
    } catch {
      throw new EndpointError(
        "CONFLICT",
        "Активная конфигурация несовместима с текущей системой. Выберите совместимый выпуск в настройках агентского слоя.",
        409,
      );
    }
    return [
      {
        key: artifact.key,
        title: artifact.title,
        description: artifact.description,
        locale: artifact.locale,
        ...(artifact.defaultWorkflowKey &&
        (!artifact.defaultWorkflowKey.startsWith(
          OWNER_ENGINEERING_PROFILE_KEY,
        ) ||
          artifact.key === OWNER_ENGINEERING_PROFILE_KEY)
          ? { defaultWorkflowKey: artifact.defaultWorkflowKey }
          : {}),
        workflows: active.release.artifacts.flatMap(({ artifact: workflow }) =>
          workflow.kind === "workflow_definition" &&
          workflow.enabled &&
          (!workflow.key.startsWith(OWNER_ENGINEERING_PROFILE_KEY) ||
            artifact.key === OWNER_ENGINEERING_PROFILE_KEY) &&
          artifact.workflowKeys.includes(workflow.key)
            ? [
                {
                  key: workflow.key,
                  title: workflow.title,
                  description: workflow.description,
                },
              ]
            : [],
        ),
      },
    ];
  });
  return {
    activePointer: active.pointer,
    release: {
      id: active.release.id,
      version: active.release.version,
      manifestHash: active.release.manifestHash,
    },
    profiles,
  };
};

/** Проверка идёт только для нового запроса; исторический replay использует сохранённый run. */
export const resolveAIChatConfiguration = async (
  req: PayloadRequest,
  selection: AIChatConfigurationSelection | undefined,
  request: string,
  options?: SanitizedRealizeAIPluginOptions,
): Promise<AIChatConfigurationSnapshot | undefined> => {
  if (selection?.profileKey === OWNER_ENGINEERING_PROFILE_KEY)
    await requireOwnerEngineeringAccess(req, options);
  const active = await readActive(req);
  if (!active) {
    if (selection)
      throw new EndpointError(
        "CONFLICT",
        "Активная конфигурация изменилась. Обновите список профилей и повторите отправку.",
        409,
      );
    return undefined;
  }
  if (
    !selection ||
    selection.releaseID !== active.release.id ||
    selection.manifestHash !== active.release.manifestHash
  )
    throw new EndpointError(
      "CONFLICT",
      "Выберите профиль текущего активного выпуска. Обновите список профилей; текст сообщения сохранён.",
      409,
    );
  try {
    const snapshot = parseAIChatConfigurationSnapshot({
      schemaVersion: "1.0",
      pointerVersion: active.pointer.version,
      releaseVersion: active.release.version,
      compiled: compileAgentConfiguration({
        release: active.release,
        system: SYSTEM_AI_CONFIG_PROJECTION,
        profileKey: selection.profileKey,
      }),
    });
    buildAIChatConfigurationInstructions(snapshot, { request });
    return snapshot;
  } catch (error) {
    throw new EndpointError(
      "INVALID_REQUEST",
      error instanceof Error
        ? `Профиль нельзя применить к сообщению: ${error.message}`
        : "Профиль нельзя применить к сообщению.",
      400,
    );
  }
};
