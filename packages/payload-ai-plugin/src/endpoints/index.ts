/**
 * @file packages/payload-ai-plugin/src/endpoints/index.ts
 * @version 2026-08-21
 * @description Registers chat, approval, isolated execution and preview endpoints.
 */

import type { Endpoint } from "payload";

import { DEFAULT_API_ROUTE } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createChangeHandlers } from "./changeHandlers";
import { createExecutionHandlers } from "./executionHandlers";
import { createPreviewHandlers } from "./previewHandlers";
import {
  createConversationHandlers,
  createRunHandlers,
  createStatusHandler,
} from "./handlers";
import { createRunEventsHandler } from "./stream";

export const createAIEndpoints = (
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] => {
  const conversations = createConversationHandlers(options);
  const changes = createChangeHandlers(options);
  const runs = createRunHandlers(options);
  const execution = createExecutionHandlers(options);
  const preview = createPreviewHandlers(options);

  return [
    {
      handler: createStatusHandler(options),
      method: "get",
      path: `${DEFAULT_API_ROUTE}/status`,
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
