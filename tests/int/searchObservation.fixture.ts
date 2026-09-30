/**
 * @file tests/int/searchObservation.fixture.ts
 * @version 1.0.0
 * @date 2026-09-27
 * @description Создаёт безопасное тестовое событие диагностики без пользовательского содержимого.
 */
import { randomUUID } from "node:crypto";
import type { SearchObservation } from "@realize/ai-contracts";
export function searchObservationFixture(
  extra: Partial<SearchObservation> = {},
): SearchObservation {
  return {
    schemaVersion: "1.0",
    eventID: randomUUID(),
    observedAt: new Date().toISOString(),
    source: "cli",
    operation: "matches",
    queryKind: "literal",
    caseSensitive: false,
    narrowed: true,
    profile: "code",
    outcome: "complete",
    reason: null,
    durationMs: 12,
    firstMatchMs: 10,
    candidateFiles: 1,
    filesRead: null,
    bytesRead: null,
    excludedFiles: null,
    returnedCount: 1,
    outputBytes: 50,
    outputUnit: "cli_records_utf8",
    continuationRequested: false,
    continuationOffered: false,
    limits: {
      results: 10,
      responseBytes: 8192,
      timeoutMs: 10000,
      scanBytes: null,
    },
    coordinates: "utf8_bytes_1based",
    modelTokens: null,
    ...extra,
  };
}
