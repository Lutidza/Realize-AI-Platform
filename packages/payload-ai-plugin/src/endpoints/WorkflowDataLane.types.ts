/**
 * @file packages/payload-ai-plugin/src/endpoints/WorkflowDataLane.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Отделяет вход workflow Data Lane от безопасных результатов шага.
 */
import type {
  AIChatConfigurationSnapshot,
  JSONValue,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";

export type WorkflowDataLaneInput = {
  req: PayloadRequest;
  options: SanitizedRealizeAIPluginOptions;
  userID: number | string;
  conversationID: string;
  rootRunID: string;
  configuration: AIChatConfigurationSnapshot;
};

/** Ссылка только на последнюю capability в checkpoint конкретного workflow. */
export type WorkflowCapabilityEvidence = {
  stepKey: string;
  dataOperationID: string;
  operationHash: string;
};

export type ExecuteWorkflowCapabilityInput = WorkflowDataLaneInput & {
  sourceMessageID: string;
  stepKey: string;
  capabilityBindingKey: string;
  input: Readonly<Record<string, JSONValue>>;
};

export type ExecuteWorkflowCapabilityResult = {
  output: {
    dataOperationID: string;
    state: "awaiting_approval";
    operationHash: string;
  };
  lastCapability: WorkflowCapabilityEvidence;
};

export type ExecuteWorkflowCheckInput = WorkflowDataLaneInput & {
  checkBindingKey: string;
  lastCapability?: WorkflowCapabilityEvidence;
};

export type ExecuteWorkflowCheckResult = {
  checkID: string;
  status: "passed";
  dataOperationID: string;
  operationHash: string;
  evidenceHash: string;
};
