/**
 * @file packages/ai-contracts/src/WorkflowExecution.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Разделяет ввод workflow, закрытый checkpoint и публичную сводку сегмента.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type { JSONValue, WorkflowStep } from "./workflows";

/** Явный выбор процесса из exact профиля; request назначает сервер из сообщения. */
export type WorkflowStartInput = {
  key: string;
  input?: Record<string, JSONValue>;
};

/** Продолжение immutable checkpoint; полномочия и содержимое снимка не принимаются. */
export type ContinueWorkflowInput = {
  expectedVersion: number;
  expectedStepKey: string;
  content?: string;
};

export type WorkflowPhase =
  "ready" | "running" | "awaiting_input" | "completed" | "blocked";

/** Ссылка на фактический DataOperation, созданный предыдущим capability шагом. */
export type WorkflowCapabilityReceipt = {
  stepKey: string;
  dataOperationID: string;
  operationHash: string;
};

/** Закрытое JSON-состояние; не передаётся браузеру и не предоставляет tool authority. */
export type WorkflowCheckpoint = {
  schemaVersion: "1.0";
  workflowKey: string;
  version: number;
  stepKey: string;
  completedSteps: number;
  phase: WorkflowPhase;
  input: Record<string, JSONValue>;
  outputs: Record<string, JSONValue>;
  parentRunID?: string;
  rootRunID?: string;
  reason?: string;
  lastCapability?: WorkflowCapabilityReceipt;
};

/** Allowlist сводки запуска без prompt, входов, результатов и capability bindings. */
export type WorkflowRunSummary = {
  key: string;
  title: string;
  revision: number;
  stepKey: string;
  stepType: WorkflowStep["type"];
  version: number;
  completedSteps: number;
  phase: WorkflowPhase;
  reason?: string;
  parentRunID?: string;
  rootRunID?: string;
};

/** Отсутствие значения отличается от null, false, нуля и пустой строки. */
export type WorkflowValueResolution =
  { found: false } | { found: true; value: JSONValue };
