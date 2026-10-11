/**
 * @file packages/payload-ai-plugin/src/usage/measureUsageOperation.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Измеряет checks и подготовку preview независимо от модельных токенов.
 */
import { randomUUID } from "node:crypto";
import type { UsageContext } from "@realize/ai-contracts";
import type { UsageDatabase } from "./UsageStore.types";
import { UsageLedgerRepository } from "./UsageLedger.repository";

export async function measureUsageOperation<T>(
  database: UsageDatabase,
  context: UsageContext,
  operation: () => Promise<T>,
  succeeded: (value: T) => boolean,
): Promise<T> {
  const ledger = new UsageLedgerRepository(database);
  const attempt = await ledger.begin({
    attemptId: randomUUID(),
    context,
    provider: "platform",
    authMode: "internal",
    requestedModel: null,
    startedAt: new Date().toISOString(),
  });
  const started = performance.now();
  let outcome: "completed" | "failed" = "failed";
  try {
    const result = await operation();
    outcome = succeeded(result) ? "completed" : "failed";
    return result;
  } finally {
    await ledger.observe({
      schemaVersion: "1.0",
      eventId: `${attempt.attemptId}:1`,
      attemptId: attempt.attemptId,
      sequence: 1,
      observedAt: new Date().toISOString(),
      outcome,
      model: null,
      tokens: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
      },
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      toolDurationMs: null,
      coverage: "turn",
      providerEvidence: null,
    });
  }
}
