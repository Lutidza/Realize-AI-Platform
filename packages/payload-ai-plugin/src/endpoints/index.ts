/**
 * @file packages/payload-ai-plugin/src/endpoints/index.ts
 * @version 1.8.0
 * @date 2026-09-12
 * @description Регистрирует runtime, integration и installation Config API endpoints.
 */

import type { Endpoint } from "payload";

import { DEFAULT_API_ROUTE } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createChatContextEndpoints } from "../chat-context/chatContextEndpoints.controller";
import { createPageDraftContextEndpoints } from "../chat-context/pageDraftContextEndpoints.controller";
import { createAIConfigEndpoints } from "./aiConfigEndpoints";
import { createChangeHandlers } from "./changeHandlers";
import { createDataOperationHandlers } from "./dataOperationHandlers";
import { createExecutionHandlers } from "./executionHandlers";
import { createIntegrationHandlers } from "./integrationHandlers";
import { createCodexIntegrationHandlers } from "./codexIntegrationHandlers";
import { createCodexAgentSettingsHandlers } from "./codexAgentSettingsHandlers";
import { createCodexAgentDiagnosticsHandler } from "./codexAgentDiagnosticsHandler";
import {
  createCodexRuntimeHandlers,
  withCodexRuntime,
} from "./withCodexRuntime.controller";
import { createCodexChatSettingsHandlers } from "./codexChatSettingsHandlers";
import { createCodexLoginEndpoints } from "./codexLoginEndpoints.config";
import { createPreviewHandlers } from "./previewHandlers";
import { createReleaseHandlers } from "./releaseHandlers";
import { createSourcePromotionHandlers } from "./sourcePromotionHandlers";
import {
  createConversationHandlers,
  createRunHandlers,
  createStatusHandler,
} from "./handlers";
import { createRunEventsHandler } from "./stream";
import { createWorkflowContinueHandler } from "../chat-context/workflowContinueHandler.controller";
import { createWorkflowRunEndpoints } from "./workflowRunEndpoints.controller";

export const createAIEndpoints = (
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] => {
  const conversations = createCodexRuntimeHandlers(
    options,
    createConversationHandlers,
  );
  const config = createAIConfigEndpoints(options);
  const changes = createCodexRuntimeHandlers(options, createChangeHandlers);
  const dataOperations = createCodexRuntimeHandlers(
    options,
    createDataOperationHandlers,
  );
  const runs = createCodexRuntimeHandlers(options, createRunHandlers);
  const execution = createCodexRuntimeHandlers(
    options,
    createExecutionHandlers,
  );
  const integrations = createIntegrationHandlers(options);
  const codex = createCodexIntegrationHandlers(options);
  const agentSettings = createCodexAgentSettingsHandlers(options);
  const chatSettings = createCodexChatSettingsHandlers(options);
  const preview = createCodexRuntimeHandlers(options, createPreviewHandlers);
  const release = createCodexRuntimeHandlers(options, createReleaseHandlers);
  const sourcePromotion = createCodexRuntimeHandlers(
    options,
    createSourcePromotionHandlers,
  );

  return [
    ...createWorkflowRunEndpoints(options),
    {
      handler: withCodexRuntime(options, createWorkflowContinueHandler),
      method: "post",
      path: `${DEFAULT_API_ROUTE}/runs/:id/workflow/continue`,
    },
    ...createChatContextEndpoints(options),
    ...createPageDraftContextEndpoints(options),
    {
      handler: withCodexRuntime(options, createStatusHandler),
      method: "get",
      path: `${DEFAULT_API_ROUTE}/status`,
    },
    ...config,
    ...createCodexLoginEndpoints(options),
    {
      handler: createCodexAgentDiagnosticsHandler(options),
      method: "get",
      path: `${DEFAULT_API_ROUTE}/integrations/codex/diagnostics`,
    },
    {
      handler: agentSettings.save,
      method: "put",
      path: `${DEFAULT_API_ROUTE}/integrations/codex/agent-settings`,
    },
    {
      handler: chatSettings.read,
      method: "get",
      path: `${DEFAULT_API_ROUTE}/chat/settings`,
    },
    {
      handler: chatSettings.save,
      method: "put",
      path: `${DEFAULT_API_ROUTE}/integrations/codex/chat-settings`,
    },
    {
      handler: codex.environment,
      method: "get",
      path: `${DEFAULT_API_ROUTE}/integrations/codex/auth/environment`,
    },
    {
      handler: codex.save,
      method: "put",
      path: `${DEFAULT_API_ROUTE}/integrations/codex`,
    },
    {
      handler: codex.test,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/integrations/codex/test`,
    },
    {
      handler: codex.disconnect,
      method: "delete",
      path: `${DEFAULT_API_ROUTE}/integrations/codex`,
    },
    {
      handler: integrations.list,
      method: "get",
      path: `${DEFAULT_API_ROUTE}/integrations`,
    },
    {
      handler: integrations.saveGitHub,
      method: "put",
      path: `${DEFAULT_API_ROUTE}/integrations/github`,
    },
    {
      handler: integrations.testGitHub,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/integrations/github/test`,
    },
    {
      handler: integrations.disconnectGitHub,
      method: "delete",
      path: `${DEFAULT_API_ROUTE}/integrations/github`,
    },
    {
      handler: conversations.list,
      method: "get",
      path: `${DEFAULT_API_ROUTE}/conversations`,
    },
    {
      handler: conversations.create,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/conversations`,
    },
    {
      handler: conversations.detail,
      method: "get",
      path: `${DEFAULT_API_ROUTE}/conversations/:id`,
    },
    {
      handler: conversations.message,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/conversations/:id/messages`,
    },
    {
      handler: conversations.archive,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/conversations/:id/archive`,
    },
    {
      handler: changes.create,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/conversations/:id/changes`,
    },
    {
      handler: dataOperations.create,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/conversations/:id/data-operations`,
    },
    {
      handler: dataOperations.detail,
      method: "get",
      path: `${DEFAULT_API_ROUTE}/data-operations/:id`,
    },
    {
      handler: dataOperations.approve,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/data-operations/:id/approve`,
    },
    {
      handler: dataOperations.reject,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/data-operations/:id/reject`,
    },
    {
      handler: dataOperations.apply,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/data-operations/:id/apply`,
    },
    {
      handler: dataOperations.approveRollback,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/data-operations/:id/approve-rollback`,
    },
    {
      handler: dataOperations.rollback,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/data-operations/:id/rollback`,
    },
    {
      handler: changes.detail,
      method: "get",
      path: `${DEFAULT_API_ROUTE}/changes/:id`,
    },
    {
      handler: changes.approve,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/changes/:id/approve-plan`,
    },
    {
      handler: changes.reject,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/changes/:id/reject-plan`,
    },
    {
      handler: execution.execute,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/changes/:id/execute`,
    },
    {
      handler: execution.accept,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/changes/:id/accept-implementation`,
    },
    {
      handler: execution.reject,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/changes/:id/reject-implementation`,
    },
    {
      handler: preview.deploy,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/changes/:id/deploy-preview`,
    },
    {
      handler: preview.accept,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/changes/:id/accept-preview`,
    },
    {
      handler: preview.reject,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/changes/:id/reject-preview`,
    },
    {
      handler: preview.detail,
      method: "get",
      path: `${DEFAULT_API_ROUTE}/deployments/:id`,
    },
    {
      handler: release.prepare,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/changes/:id/prepare-release`,
    },
    {
      handler: release.approve,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/changes/:id/approve-release`,
    },
    {
      handler: release.reject,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/changes/:id/reject-release`,
    },
    {
      handler: release.detail,
      method: "get",
      path: `${DEFAULT_API_ROUTE}/release-candidates/:id`,
    },
    {
      handler: sourcePromotion.publish,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/changes/:id/publish-pull-request`,
    },
    {
      handler: sourcePromotion.detail,
      method: "get",
      path: `${DEFAULT_API_ROUTE}/source-promotions/:id`,
    },
    {
      handler: runs.detail,
      method: "get",
      path: `${DEFAULT_API_ROUTE}/runs/:id`,
    },
    {
      handler: createRunEventsHandler(options),
      method: "get",
      path: `${DEFAULT_API_ROUTE}/runs/:id/events`,
    },
    {
      handler: runs.cancel,
      method: "post",
      path: `${DEFAULT_API_ROUTE}/runs/:id/cancel`,
    },
  ];
};
