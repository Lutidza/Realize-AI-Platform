/**
 * @file packages/payload-ai-plugin/src/usage/usageGroupExpressions.config.ts
 * @version 1.0.0
 * @date 2026-10-06
 * @description Согласует ключи SQL-групп, фильтров и доступных значений аналитики.
 */
import { usageGroupKeys } from "@realize/ai-contracts";

/** Только константы контракта; пользовательские значения передаются отдельно в SQL parameters. */
export const usageGroupExpressions = {
  models: `CASE WHEN record->>'provider'='platform' THEN '${usageGroupKeys.noModel}' ELSE COALESCE(record->>'model','${usageGroupKeys.unassigned}') END`,
  workflows: `COALESCE(record->'context'->>'workflowKey','${usageGroupKeys.unassigned}')`,
  agents: `COALESCE(record->'context'->>'agentProfileKey','${usageGroupKeys.unassigned}')`,
} as const;
