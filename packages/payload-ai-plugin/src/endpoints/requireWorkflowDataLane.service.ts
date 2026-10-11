/**
 * @file packages/payload-ai-plugin/src/endpoints/requireWorkflowDataLane.service.ts
 * @version 1.2.0
 * @date 2026-10-04
 * @description Проверяет текущие права и системный потолок до Data Lane шага процесса.
 */
import {
  parseAIChatConfigurationSnapshot,
  assertRuntimeAIConfiguration,
  SYSTEM_AI_CONFIG_PROJECTION,
} from "@realize/change-engine";
import { requireChatUser, requireDataManager } from "./access";
import { EndpointError } from "./http";
import { requireCodexChatTool } from "./requireCodexChatTool.service";
import type { WorkflowDataLaneInput } from "./WorkflowDataLane.types";

/** Historical snapshot не выдаёт authority и не заменяет текущие access/tool settings. */
export const requireWorkflowDataLane = async (input: WorkflowDataLaneInput) => {
  await requireChatUser(input.req, input.options);
  const user = await requireDataManager(input.req, input.options);
  if (String(user.id) !== String(input.userID))
    throw new EndpointError(
      "FORBIDDEN",
      "Владелец процесса не совпадает с текущим пользователем.",
      403,
    );
  await requireCodexChatTool(input.req, "dataOperations", input.options);
  const configuration = parseAIChatConfigurationSnapshot(input.configuration);
  const compiled = configuration.compiled;
  if (
    compiled.systemReleaseID !== SYSTEM_AI_CONFIG_PROJECTION.releaseID ||
    compiled.systemManifestHash !== SYSTEM_AI_CONFIG_PROJECTION.manifestHash ||
    compiled.systemVersion !== SYSTEM_AI_CONFIG_PROJECTION.version ||
    compiled.projectProfile !== SYSTEM_AI_CONFIG_PROJECTION.projectProfile
  )
    throw new EndpointError(
      "CONFLICT",
      "Системная политика изменилась; этот процесс больше не может готовить или проверять операции данных.",
      409,
    );
  assertRuntimeAIConfiguration(
    {
      releaseID: compiled.systemReleaseID,
      manifestHash: compiled.systemManifestHash,
    },
    configuration,
  );
  return configuration;
};
