/**
 * @file .ai/tools/worker-assignment/src/evaluateAuditCoverage.service.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Передаёт на приёмку итерации накопленные отчёты, предметные обязательства и проверяемые результаты поисков.
 * @see documentation/specifications/internal-mcp.md
 */
import type { AuditExpansion } from "./auditExpansion.service";
import type { AssignmentBindResult } from "./WorkerAssignment.types";
import { executeIsolatedIdeAudit } from "./adapters/executeIsolatedIdeAudit.adapter";
import { isDeepStrictEqual } from "node:util";
import type { IdeAuditRange } from "realize-ai-platform/ide-assignment-queue";

/** Прерывание дополнительной приёмки оставляет в силе основной план раунда и его открытые вопросы. */
export async function optionalAuditFocus<T>(
  evaluate: () => Promise<T>,
  signal: AbortSignal,
  recordInterruption: () => void,
): Promise<T | undefined> {
  try {
    return await evaluate();
  } catch (error) {
    signal.throwIfAborted();
    if (!(
      error instanceof Error &&
      error.message === "assignment_executor_interrupted"
    ))
      throw error;
    recordInterruption();
    return undefined;
  }
}

export async function evaluateAuditCoverage(
  summary: AssignmentBindResult,
  signal: AbortSignal,
  renew: () => void,
  context: string[],
  expansion: AuditExpansion | undefined,
  readingQuestions: string[],
  inaccessible: string[],
  material?: {
    ranges: IdeAuditRange[];
    record: (ranges: IdeAuditRange[]) => void;
    focus?: boolean;
  },
) {
  if (expansion) {
    for (const lookup of expansion.describeQueries())
      context.push(JSON.stringify({ lookup }));
  }
  // Крупная итерация сворачивается ограниченными пакетами до передачи следующему исполнителю.
  while (
    context.reduce((n, x) => n + Buffer.byteLength(x), 0) > 96 * 1024 &&
    context.length > 1
  ) {
    const reduced: string[] = [];
    let packet: string[] = [],
      bytes = 0;
    const flush = async () => {
      if (packet.length === 1) reduced.push(packet[0]);
      else if (packet.length) {
        renew();
        const partial = await executeIsolatedIdeAudit(
          summary,
          signal,
          {},
          packet,
          "",
          undefined,
          "reduce",
        );
        reduced.push(partial.report);
      }
      packet = [];
      bytes = 0;
    };
    for (const entry of context) {
      if (bytes + Buffer.byteLength(entry) > 60 * 1024 && packet.length)
        await flush();
      packet.push(entry);
      bytes += Buffer.byteLength(entry);
    }
    await flush();
    if (reduced.length === context.length) break;
    context.splice(0, context.length, ...reduced);
  }
  if (expansion)
    context.push(
      JSON.stringify({
        areas: expansion.describe(),
        profiles: expansion.describeProfiles(),
        needsEvidence: expansion.unresolved(),
        objectives: [...expansion.objectives.values()],
        diagnostics: [...expansion.diagnostics],
        unresolvedConsumers: [...expansion.consumers.values()].filter(
          (c) => !c.checked,
        ),
        localQuestions: readingQuestions,
        unavailableSources: inaccessible,
        executedLookups: [...expansion.queries.values()].map((q) => ({
          kind: q.request.kind,
          scope: q.request.scope,
          value: q.request.value,
          source: q.request.source,
          line: q.request.line,
          matches: q.matches,
          refine: !!q.refinement,
        })),
      }),
    );
  return executeIsolatedIdeAudit(
    summary,
    signal,
    Object.fromEntries(
      (material?.ranges ?? []).map((r) => [r.path, [r.startLine, r.endLine]]),
    ),
    context,
    expansion
      ? JSON.stringify({
          exactPassages: expansion.exactPassages(
            [...expansion.objectives.values()]
              .filter((o) => !o.checked)
              .map((o) => o.basis)
              .concat(readingQuestions)
              .join(" "),
          ),
        })
      : "",
    material?.ranges.length
      ? (delivered) => {
          if (!isDeepStrictEqual(material.ranges, delivered))
            throw new Error("assignment_delivery_incomplete: приёмка");
          material.record(delivered);
        }
      : undefined,
    material?.focus ? "focus" : !!expansion,
  );
}
