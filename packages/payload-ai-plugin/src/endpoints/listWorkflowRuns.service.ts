/**
 * @file packages/payload-ai-plugin/src/endpoints/listWorkflowRuns.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Формирует safe страницы реестра и исторических вариантов фильтров.
 */

import type {
  WorkflowRunListDTO,
  WorkflowRunListQuery,
  WorkflowRunOptionsDTO,
  WorkflowRunOptionsQuery,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { WorkflowRunRegistryRepository } from "./WorkflowRunRegistry.repository";
import { toWorkflowRegistryItem } from "./toWorkflowRegistryItem.mapper";
import { redactText } from "./redaction";

export const listWorkflowRuns = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  userID: number | string,
  query: WorkflowRunListQuery,
): Promise<WorkflowRunListDTO> => {
  const result = await new WorkflowRunRegistryRepository(req).list(
    userID,
    query,
  );
  return {
    items: result.items.map((item) =>
      toWorkflowRegistryItem({ ...item, enabled: options.enabled }),
    ),
    page: query.page,
    pageSize: query.pageSize,
    totalItems: result.total,
    totalPages: Math.ceil(result.total / query.pageSize),
  };
};

export const listWorkflowRunOptions = async (
  req: PayloadRequest,
  userID: number | string,
  query: WorkflowRunOptionsQuery,
): Promise<WorkflowRunOptionsDTO> => {
  const result = await new WorkflowRunRegistryRepository(req).options(
    userID,
    query,
  );
  return {
    ...result,
    items: result.items.map(({ key, title }) => ({
      key,
      title: redactText(title),
    })),
  };
};
