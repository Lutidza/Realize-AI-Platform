/**
 * @file packages/payload-ai-plugin/src/usage/readUsageFilterOptions.repository.ts
 * @version 1.0.0
 * @date 2026-10-06
 * @description Возвращает ограниченные account scope списки групп в общем snapshot дашборда.
 */
import type { UsageFilterOptionsDto } from "@realize/ai-contracts";
import type { UsageTransaction } from "./UsageStore.types";
import { usageGroupExpressions } from "./usageGroupExpressions.config";

export async function readUsageFilterOptions(
  client: UsageTransaction,
  where: string,
  values: unknown[],
): Promise<UsageFilterOptionsDto> {
  const result: UsageFilterOptionsDto = {
    models: [],
    workflows: [],
    agents: [],
  };
  for (const dimension of ["models", "workflows", "agents"] as const) {
    const rows = await client.query<{ key: string }>(
      `SELECT DISTINCT ${usageGroupExpressions[dimension]} AS key
       FROM realize_ai_usage_attempts WHERE ${where} ORDER BY key LIMIT 368`,
      values,
    );
    if (rows.rows.length > 367) throw new Error("USAGE_QUERY_TOO_WIDE");
    result[dimension] = rows.rows.map(({ key }) => key);
  }
  return result;
}
