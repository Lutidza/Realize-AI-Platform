/**
 * @file packages/ai-contracts/src/WorkflowRunRegistry.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт безопасный контракт реестра процессов, истории и доступных действий.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type { ConversationDTO, RunDTO } from "./api";
import type { DataOperationDTO } from "./dataOperations";
import type { WorkflowStep } from "./workflows";

export type WorkflowRegistryStatus =
  | "queued"
  | "running"
  | "ready"
  | "awaiting_input"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled";

/** Даты ограничивают создание корня: включённая нижняя и исключённая верхняя граница. */
export type WorkflowRunListQuery = {
  page: number;
  pageSize: number;
  query?: string;
  workflowKey?: string;
  profileKey?: string;
  status?: WorkflowRegistryStatus;
  createdFrom?: string;
  createdTo?: string;
};

export type WorkflowRunOptionsQuery = {
  kind: "workflow" | "profile";
  page: number;
  pageSize: number;
  query?: string;
};

/** Только актуальный leaf может предлагать действие; endpoint повторно проверяет полномочия. */
export type WorkflowRegistryActions = {
  continue: boolean;
  reply: boolean;
  recover: boolean;
  cancel: boolean;
  reason?: string;
};

export type WorkflowRegistryItem = {
  rootRunID: string;
  latestRun: RunDTO;
  conversation: Pick<ConversationDTO, "id" | "title" | "status">;
  status: WorkflowRegistryStatus;
  createdAt: string;
  updatedAt: string;
  segmentCount: number;
  actions: WorkflowRegistryActions;
};

export type WorkflowRunListDTO = {
  items: WorkflowRegistryItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type WorkflowRunOptionsDTO = {
  items: { key: string; title: string }[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

/** Полная цепочка ограничена контрактом workflow (64 шага); времена относятся к сегменту. */
export type WorkflowRegistrySegment = {
  run: RunDTO;
  completedStepKeys: string[];
};

/** Вывод шага имеет явную форму; private inputs, snapshot и произвольный JSON не выдаются. */
export type WorkflowRegistryStepResult =
  | { type: "text"; text: string; truncated: boolean }
  | { type: "branch"; matched: boolean }
  | {
      type: "capability";
      dataOperationID: string;
      operationHash: string;
      state: string;
    }
  | {
      type: "check";
      checkID: string;
      status: string;
      evidenceHash: string;
      dataOperationID: string;
      operationHash: string;
    }
  | { type: "finish"; outcome: string };

export type WorkflowRegistryStep = {
  key: string;
  type: WorkflowStep["type"];
  title?: string;
  status: "completed" | "current" | "skipped" | "pending";
  segmentRunID?: string;
  result?: WorkflowRegistryStepResult;
};

export type WorkflowRunDetailDTO = {
  item: WorkflowRegistryItem;
  segments: WorkflowRegistrySegment[];
  steps: WorkflowRegistryStep[];
  dataOperations: DataOperationDTO[];
  permissions: {
    /** Доступность действий в карточке: право роли и включённый AI; история остаётся доступной. */
    canManageData: boolean;
    canManageConfiguration: boolean;
  };
};
