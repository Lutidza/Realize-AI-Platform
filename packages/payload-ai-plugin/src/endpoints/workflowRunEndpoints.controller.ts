/**
 * @file packages/payload-ai-plugin/src/endpoints/workflowRunEndpoints.controller.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Авторизует чтение реестра процессов и валидирует route/query перед серверной проекцией.
 */

import {
  parseIdentifier,
  parseWorkflowRunListQuery,
  parseWorkflowRunOptionsQuery,
} from "@realize/ai-contracts";
import type { Endpoint, PayloadRequest } from "payload";
import { DEFAULT_API_ROUTE } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { requireChatUser } from "./access";
import { success } from "./http";
import { withCodexRuntime } from "./withCodexRuntime.controller";
import { withHandler } from "./request";
import { getWorkflowRunDetail } from "./getWorkflowRunDetail.service";
import {
  listWorkflowRunOptions,
  listWorkflowRuns,
} from "./listWorkflowRuns.service";

const queryFor = (req: PayloadRequest) =>
  new URL(req.url || "http://localhost", "http://localhost").searchParams;

/** История доступна и при выключенном AI; mutations остаются у существующих runtime endpoints. */
export const createWorkflowRunEndpoints = (
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] => [
  {
    path: `${DEFAULT_API_ROUTE}/workflow-runs`,
    method: "get",
    handler: withCodexRuntime(options, (options) =>
      withHandler(async (req, correlationID) => {
        const user = await requireChatUser(req, options);
        return success(
          await listWorkflowRuns(
            req,
            options,
            user.id,
            parseWorkflowRunListQuery(queryFor(req)),
          ),
          correlationID,
        );
      }),
    ),
  },
  {
    path: `${DEFAULT_API_ROUTE}/workflow-runs/options`,
    method: "get",
    handler: withCodexRuntime(options, (options) =>
      withHandler(async (req, correlationID) => {
        const user = await requireChatUser(req, options);
        return success(
          await listWorkflowRunOptions(
            req,
            user.id,
            parseWorkflowRunOptionsQuery(queryFor(req)),
          ),
          correlationID,
        );
      }),
    ),
  },
  {
    path: `${DEFAULT_API_ROUTE}/workflow-runs/:rootRunID`,
    method: "get",
    handler: withCodexRuntime(options, (options) =>
      withHandler(async (req, correlationID) => {
        const user = await requireChatUser(req, options);
        return success(
          await getWorkflowRunDetail(
            req,
            options,
            user.id,
            parseIdentifier(req.routeParams?.rootRunID, "workflow root id"),
          ),
          correlationID,
        );
      }),
    ),
  },
];
