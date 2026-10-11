/**
 * @file packages/payload-ai-plugin/src/usage/UsageAnalytics.types.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Ограничивает внутренний запрос аналитики уже авторизованным SQL scope и reader денежных агрегатов.
 */
import type { PoolClient } from "pg";
import type { UsageAmountDto } from "@realize/ai-contracts";

export type UsageAmountSegment = "all" | "retry" | "unsuccessful";
export type UsageAnalyticsReadOptions = {
  client: PoolClient;
  where: string;
  values: unknown[];
  from: string;
  to: string;
  readAmounts: (
    values: unknown[],
    segment: UsageAmountSegment,
  ) => Promise<UsageAmountDto[]>;
};
