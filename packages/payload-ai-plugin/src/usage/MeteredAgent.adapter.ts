/**
 * @file packages/payload-ai-plugin/src/usage/MeteredAgent.adapter.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Сохраняет расходы независимо от SSE и допускает provider только после durable admission.
 */
import { randomUUID } from "node:crypto";
import type {
  AgentEvent,
  CodingAgentAdapter,
  RunTurnInput,
  UsageAttemptInput,
  UsageObservation,
} from "@realize/ai-contracts";
import type { UsageWriter } from "./UsageStore.types";

export class MeteredAgentAdapter implements CodingAgentAdapter {
  constructor(
    private readonly adapter: CodingAgentAdapter,
    private readonly writer: UsageWriter,
    private readonly context: () => Promise<
      Omit<UsageAttemptInput, "attemptId" | "startedAt">
    >,
  ) {}
  cancelRun(runId: string): Promise<void> {
    return this.adapter.cancelRun(runId);
  }

  async *runTurn(input: RunTurnInput): AsyncIterable<AgentEvent> {
    const attempt = await this.writer.begin({
      ...(await this.context()),
      attemptId: randomUUID(),
      startedAt: new Date().toISOString(),
    });
    const started = performance.now();
    let sequence = 0;
    let outcome: UsageObservation["outcome"] = "cancelled";
    let terminal = false;
    let measurement:
      | Extract<AgentEvent, { type: "usage.measured" }>["measurement"]
      | undefined;
    let toolDurationMs: number | null = null;
    const persist = async (state: UsageObservation["outcome"]) =>
      this.writer.observe({
        schemaVersion: "1.0",
        eventId: `${attempt.attemptId}:${++sequence}`,
        attemptId: attempt.attemptId,
        sequence,
        observedAt: new Date().toISOString(),
        outcome: state,
        model: measurement?.model ?? null,
        tokens: measurement?.tokens ?? attempt.tokens,
        durationMs: Math.max(0, Math.round(performance.now() - started)),
        toolDurationMs,
        coverage: measurement
          ? ["failed", "cancelled"].includes(state)
            ? "partial"
            : measurement.coverage
          : "unknown",
        providerEvidence: measurement
          ? {
              threadId: measurement.providerThreadId,
              turnId: measurement.providerTurnId,
              measurementId: measurement.measurementId,
            }
          : null,
      });
    try {
      for await (const event of this.adapter.runTurn(input)) {
        if (event.type === "usage.measured") {
          measurement = event.measurement;
          if ((await persist("running")).budgetExceeded) {
            await this.adapter.cancelRun(input.runID);
            throw new Error("USAGE_BUDGET_EXCEEDED_DURING_TURN");
          }
          continue;
        }
        if (
          event.type === "tool.completed" &&
          Number.isSafeInteger(event.durationMs) &&
          event.durationMs! >= 0
        )
          toolDurationMs = (toolDurationMs ?? 0) + event.durationMs!;
        if (
          event.type === "assistant.completed" ||
          event.type === "run.failed" ||
          event.type === "run.cancelled"
        ) {
          outcome =
            event.type === "assistant.completed"
              ? "completed"
              : event.type === "run.failed"
                ? "failed"
                : "cancelled";
          const result = await persist(outcome);
          terminal = true;
          if (result.budgetExceeded && outcome === "completed") {
            yield {
              type: "run.failed",
              message:
                "Расход превысил бюджет. Результат требует проверки владельцем бюджета.",
            };
            return;
          }
        }
        yield event;
        if (terminal) return;
      }
    } catch (error) {
      outcome = "failed";
      // Потеря ledger прекращает provider; оставшийся резерв не исчезает при сбое записи.
      await this.adapter.cancelRun(input.runID).catch(() => undefined);
      throw error;
    } finally {
      if (!terminal) {
        await this.adapter.cancelRun(input.runID).catch(() => undefined);
        await persist(outcome);
      }
    }
  }
}
