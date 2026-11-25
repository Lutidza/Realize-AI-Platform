/**
 * @file .ai/tools/worker-assignment/src/admission/AttemptObservations.repository.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Хранит снимки проверенных фактов одной попытки в памяти доверенного адаптера.
 */
import { randomUUID } from "node:crypto";
import type {
  ObservationFacts,
  ObservationRef,
} from "./AssignmentAdmission.types";

export class AttemptObservations {
  private readonly entries = new Map<
    string,
    {
      kind: ObservationRef["kind"];
      facts: ObservationFacts[keyof ObservationFacts];
    }
  >();
  constructor(private readonly attemptId: string) {}

  record<K extends keyof ObservationFacts>(
    kind: K,
    facts: ObservationFacts[K],
  ): ObservationRef {
    const evidenceId = randomUUID();
    this.entries.set(evidenceId, { kind, facts: structuredClone(facts) });
    return { kind, evidenceId };
  }

  resolve = (attemptId: string, ref: ObservationRef) => {
    const entry = this.entries.get(ref.evidenceId);
    if (attemptId !== this.attemptId || entry?.kind !== ref.kind)
      return undefined;
    return structuredClone(entry.facts);
  };
}
