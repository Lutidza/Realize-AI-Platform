/**
 * @file packages/payload-ai-plugin/src/endpoints/WorkflowRunProjection.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Описывает проверенные серверные входы проекции истории процесса.
 */

import type {
  AIChatConfigurationSnapshot,
  DataOperationDTO,
  WorkflowCheckpoint,
  WorkflowRunDetailDTO,
} from "@realize/ai-contracts";
import type { AIDocument } from "./repository";

export type WorkflowRegistryRow = {
  rootRunID: string;
  rootCreatedAt: string;
  latestRun: AIDocument;
  conversation: AIDocument;
  segmentCount: number;
};

export type WorkflowRegistryItemInput = WorkflowRegistryRow & {
  enabled: boolean;
};

export type WorkflowProjectionSegment = {
  run: AIDocument;
  configuration: AIChatConfigurationSnapshot;
  checkpoint: WorkflowCheckpoint;
};

export type WorkflowRunDetailProjectionInput = {
  conversation: AIDocument;
  segments: readonly WorkflowProjectionSegment[];
  dataOperations: ReadonlyMap<string, DataOperationDTO>;
  permissions: WorkflowRunDetailDTO["permissions"];
  enabled: boolean;
};
