/**
 * @file scripts/runtime/evaluation/EvaluationRuntime.types.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Описывает server-only зависимости bounded eval harness.
 */
import type { Pool } from "pg";
import type {
  EvaluationReport,
  EvaluationCase,
} from "@realize/ai-contracts/evaluation";
import type { CodexConnectionLease } from "@realize/payload-ai-control/server/integration-runtime";
import type { UsageWriter } from "@realize/payload-ai-control/server/usage";
export type EvaluationRuntime = {
  pool: Pool;
  lease: CodexConnectionLease;
  model: string;
  environment: NodeJS.ProcessEnv;
  candidate: EvaluationReport["candidate"];
  signal: AbortSignal;
  writer: UsageWriter;
  taskId: string;
  budget: EvaluationReport["budget"];
  onTokens: (attemptId: string, tokens: number) => boolean;
};
export type EvaluationCaseInput = {
  runtime: EvaluationRuntime;
  directory: string;
  scenarioId: EvaluationCase["scenarioId"];
  repeat: number;
};
export type EvaluationSuiteOptions = {
  root: string;
  output: string;
  environment: NodeJS.ProcessEnv;
  allowUnknownSubscriptionCost: boolean;
  signal: AbortSignal;
  preflight: boolean;
};
