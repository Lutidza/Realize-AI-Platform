/**
 * @file packages/payload-ai-plugin/src/usage/UsageRuntime.types.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Описывает серверное происхождение metering context для runtime consumers.
 */
import type { UsageContext } from "@realize/ai-contracts";
export type UsageRuntimeSource = {
  runId?: string;
  changeRequestId?: string;
  taskId: string;
  operationKey?: string;
  source: Extract<
    UsageContext["source"],
    "chat" | "workflow" | "execution" | "review" | "build" | "preview"
  >;
  authMode: string;
  model?: string;
};
