/**
 * @file packages/codex-adapter/src/readCodexUsage.mapper.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет provider counters без превращения отсутствующих измерений в нули.
 */
import { usageTokensSchema, type UsageTokens } from "@realize/ai-contracts";
import { codexRecord } from "./codexRecord.util";

export function readCodexUsage(value: unknown): UsageTokens | null {
  const record = codexRecord(value);
  if (!record) return null;
  const parsed = usageTokensSchema.safeParse(
    Object.fromEntries(
      [
        "inputTokens",
        "cachedInputTokens",
        "outputTokens",
        "reasoningOutputTokens",
        "totalTokens",
      ].map((key) => [key, record[key] ?? null]),
    ),
  );
  return parsed.success ? parsed.data : null;
}
