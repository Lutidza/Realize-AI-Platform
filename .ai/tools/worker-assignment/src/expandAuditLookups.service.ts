/**
 * @file .ai/tools/worker-assignment/src/expandAuditLookups.service.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Выполняет новые запросы в пределах инвентаря и направляет неразрешённые совпадения на полное чтение.
 * @see documentation/specifications/internal-mcp.md
 */
import type { RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import type {
  IdeAuditDelivery,
  IdeAuditRange,
} from "realize-ai-platform/ide-assignment-queue";
import {
  lookupAuditSources,
  lookupKey,
  broadLookupBranches,
  type AuditLookup,
} from "./auditSearchScope.service";
import type { AuditExpansion, QueryEvidence } from "./auditExpansion.service";
import { readAuditPassage } from "./readAuditPassage.service";
import { screenAuditMatches } from "./screenAuditMatches.service";

export async function expandAuditLookups(options: {
  policy: RepositoryReadPolicy;
  runId: string;
  round: number;
  mission: string;
  signal: AbortSignal;
  renew: () => void;
  expansion: AuditExpansion;
  fresh: AuditLookup[];
  allRanges: IdeAuditRange[];
  searchLog: (value: unknown) => number;
  notesByPath: Record<string, string[]>;
  delivery: (expected: IdeAuditDelivery, actual: IdeAuditDelivery) => void;
}) {
  const {
    policy,
    runId,
    round,
    mission,
    signal,
    renew,
    expansion,
    fresh,
    allRanges,
    searchLog,
    notesByPath,
    delivery,
  } = options;
  const pending = new Set<string>();
  let queryIndex = 0;
  const queued = new Set(fresh.map(lookupKey));
  async function investigate() {
    while (queryIndex < fresh.length) {
      const request = fresh[queryIndex++];
      renew();
      const key = lookupKey(request);
      let hits: Map<string, string>;
      try {
        hits = await lookupAuditSources(
          policy.root,
          expansion.scope,
          request,
          signal,
        );
      } catch (error) {
        signal.throwIfAborted();
        if (
          !(error instanceof Error) ||
          !error.message.startsWith("assignment_search_failed:")
        )
          throw error;
        expansion.diagnostics.add(
          error.message + " (" + request.scope + " " + request.value + ")",
        );
        expansion.rejected.add(key);
        expansion.consumers.delete(key);
        searchLog({
          phase: "lookup-failed",
          round,
          request,
          reason: error.message,
        });
        continue;
      }
      const evidence: QueryEvidence = {
        request,
        matches: hits.size,
        examples: [...hits.values()]
          .slice(0, 6)
          .map((line) => line.slice(0, 400)),
      };
      expansion.queries.set(key, evidence);
      expansion.hitPaths.set(key, new Set(hits.keys()));
      const queryStep = searchLog({
        phase: "lookup",
        round,
        ...evidence,
        paths: [...hits.keys()],
      });
      let candidates = new Set(hits.keys());
      if (request.kind === "definition") {
        if (hits.size > 16) {
          expansion.diagnostics.add(
            "У определения " +
              request.value +
              " несколько контекстов (" +
              hits.size +
              "). Уточните каталог либо конкретный путь.",
          );
          evidence.examples = [...hits.values()]
            .slice(0, 16)
            .map((v) => v.slice(0, 250));
          continue;
        }
        for (const [path, snippet] of hits) {
          const coordinate = /^.+?:(\d+):\d+:/u.exec(snippet);
          if (!coordinate) continue;
          const lookup: AuditLookup = {
            kind: "passage",
            scope: "*",
            source: path,
            line: Number(coordinate[1]),
            definition: request.value,
            value: (
              "Как реализация " +
              request.value +
              " отвечает на открытый вопрос: " +
              (request.question ?? mission)
            )
              .replace(/\s+/gu, " ")
              .slice(0, 240),
          };
          const id = lookupKey(lookup);
          if (queued.has(id) || !expansion.pendingRequests([lookup]).length)
            continue;
          queued.add(id);
          fresh.push(lookup);
        }
        continue;
      }
      if (request.kind === "passage") {
        const answer = await readAuditPassage({
          policy,
          id: runId + ".lookup." + queryStep,
          request,
          mission,
          signal,
          renew,
          record: searchLog,
          knownPaths: expansion.seen,
          expectedSha:
            allRanges.find((r) => r.path === request.source)?.fileSha256 ??
            expansion.reviewedPassages.get(request.source)?.[0]?.fileSha256,
          delivery,
        });
        evidence.passageNotes = answer.notes;
        for (const item of answer.answers)
          expansion.keepPassage(request, item.report, [item.range]);
        const known = expansion.reviewedPassages.get(request.source) ?? [];
        known.push(...answer.reviewed);
        expansion.reviewedPassages.set(request.source, known);
        if (answer.whole) {
          expansion.reviewed.set(request.source, answer.reviewed[0].totalLines);
          expansion.localQuestions.delete(request.source);
        }
        continue;
      }
      const refinement = broadLookupBranches(expansion.scope, request, [
        ...hits.keys(),
      ]);
      if (refinement) {
        evidence.refinement = refinement;
        searchLog({
          phase: "refine-query",
          round,
          request,
          matches: hits.size,
          branches: refinement,
        });
        continue;
      }
      if (request.kind === "consumer" || hits.size > 16) {
        const screen = await screenAuditMatches({
          policy,
          id: runId + ".lookup." + queryStep,
          mission,
          request,
          hits,
          signal,
          renew,
          record: searchLog,
          knownPaths: expansion.seen,
          originPin:
            allRanges.find((r) => r.path === request.source)?.fileSha256 ??
            expansion.reviewedPassages.get(request.source)?.[0]?.fileSha256 ??
            expansion.inheritedPins.get(request.source),
          delivery,
        });
        if (screen.rejected) {
          expansion.diagnostics.add(
            request.source + " " + request.value + ": " + screen.rejected,
          );
          expansion.consumers.delete(key);
          expansion.rejected.add(key);
          searchLog({
            phase: "ungrounded",
            round,
            request,
            reason: screen.rejected,
          });
          continue;
        }
        expansion.recordScreen(request, screen);
        candidates = screen.pending;
      }
      for (const path of candidates) {
        if (!expansion.seen.has(path)) pending.add(path);
        const notes = (notesByPath[path] ??= []);
        if (notes.length < 8)
          notes.push(
            request.kind +
              " " +
              request.value +
              " " +
              hits.get(path)?.slice(0, 280),
          );
      }
    }
  }
  const searches = await Promise.allSettled(
    Array.from({ length: Math.min(3, fresh.length) }, investigate),
  );
  for (const search of searches)
    if (search.status === "rejected") throw search.reason;
  return pending;
}
