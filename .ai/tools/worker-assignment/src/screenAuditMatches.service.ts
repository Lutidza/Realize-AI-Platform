/**
 * @file .ai/tools/worker-assignment/src/screenAuditMatches.service.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Выдаёт отдельные Assignment по закреплённым окнам совпадений и возвращает подтверждённые связи или пути для полного чтения.
 * @see documentation/specifications/internal-mcp.md
 */
import { isDeepStrictEqual } from "node:util";
import {
  readRepositoryFile,
  type RepositoryReadPolicy,
} from "realize-ai-platform/repository-read-policy";
import type {
  IdeAuditRange,
  IdeAuditDelivery,
} from "realize-ai-platform/ide-assignment-queue";
import { planTextAssignment } from "./planTextAssignment.service";
import { executeIsolatedIdeAudit } from "./adapters/executeIsolatedIdeAudit.adapter";
import { hashAuditText } from "./checkpoints/hashAuditText.util";
import type { AuditLookup } from "./auditSearchScope.service";

type Window = { range: IdeAuditRange; matches: number[] };
export type MatchDecision = {
  path: string;
  startLine: number;
  line: number;
  kind: "use" | "declaration" | "incidental" | "review";
  reason: string;
};

/** При текстовом поиске охватывает каждую строку с литералом. Для совпадения в пути передаёт начало файла. */
export function locateAuditMatches(
  path: string,
  text: string,
  sha: string,
  request: AuditLookup,
  radius = 3,
): Window[] {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const intervals: { start: number; end: number; matches: number[] }[] = [];
  if (request.kind === "path")
    intervals.push({ start: 1, end: Math.min(lines.length, 32), matches: [] });
  else
    for (const [i, line] of lines.entries()) {
      if (!line.includes(request.value)) continue;
      const start = Math.max(1, i + 1 - radius),
        end = Math.min(lines.length, i + 1 + radius);
      const last = intervals.at(-1);
      if (last && start <= last.end + 1) {
        last.end = end;
        last.matches.push(i + 1);
      } else intervals.push({ start, end, matches: [i + 1] });
    }
  return intervals.map((i) => {
    const content = lines.slice(i.start - 1, i.end).join("");
    return {
      matches: i.matches,
      range: {
        path,
        fileSha256: sha,
        rangeSha256: hashAuditText(content),
        byteLength: Buffer.byteLength(content),
        startLine: i.start,
        endLine: i.end,
        totalLines: lines.length,
      },
    };
  });
}

export function validMatchDecision(window: Window, decisions: MatchDecision[]) {
  const r = window.range;
  const rows = decisions.filter(
    (d) => d.path === r.path && d.startLine === r.startLine,
  );
  if (rows.length !== 1) return undefined;
  const d = rows[0];
  if (d.line < r.startLine || d.line > r.endLine || !d.reason.trim())
    return undefined;
  if (
    (d.kind === "use" || d.kind === "declaration") &&
    window.matches.length &&
    !window.matches.includes(d.line)
  )
    return undefined;
  return d;
}

export async function screenAuditMatches(options: {
  policy: RepositoryReadPolicy;
  id: string;
  mission: string;
  request: AuditLookup;
  hits: Map<string, string>;
  signal: AbortSignal;
  renew: () => void;
  record: (value: unknown) => void;
  knownPaths: Iterable<string>;
  originPin?: string;
  widerContext?: boolean;
  delivery: (plan: IdeAuditDelivery, actual: IdeAuditDelivery) => void;
}): Promise<{
  pending: Set<string>;
  decisions: MatchDecision[];
  assignments: number;
  rejected: string | undefined;
}> {
  const { policy, id, mission, request, hits, signal, renew, record } = options;
  const pending = new Set<string>(),
    decisions: MatchDecision[] = [];
  let packet: Window[] = [],
    bytes = 0,
    number = 0;
  const scopePaths = new Set<string>();
  let origin = "";
  if (request.kind === "consumer") {
    const source = await readRepositoryFile(policy, request.source, { signal });
    if (source.sha256 !== options.originPin)
      throw new Error("assignment_search_snapshot_changed: " + request.source);
    if (
      !source.text.includes(request.value) &&
      !request.source.includes(request.value)
    )
      return {
        pending,
        decisions,
        assignments: 0,
        rejected:
          "Нет указанного обозначения в закреплённом источнике или его пути.",
      };
    const lines = source.text.split("\n");
    const cited = lines.findIndex(
      (line, i) => i + 1 === request.line && line.includes(request.value),
    );
    const nearest =
      cited >= 0
        ? cited
        : lines.reduce(
            (best, line, i) =>
              line.includes(request.value) &&
              (best === -1 ||
                Math.abs(i + 1 - request.line) <
                  Math.abs(best + 1 - request.line))
                ? i
                : best,
            -1,
          );
    const lineNumber = nearest < 0 ? request.line : nearest + 1;
    origin = JSON.stringify({
      path: request.source,
      sha256: source.sha256,
      line: lineNumber,
      text: lines
        .slice(Math.max(0, lineNumber - 4), lineNumber + 3)
        .join("\n")
        .slice(0, 2400),
    });
  }
  async function flush() {
    if (!packet.length) return;
    renew();
    const assignmentId = id + "." + ++number;
    const paths = [
      ...new Set([
        ...scopePaths,
        ...(request.kind === "consumer" ? [request.source] : []),
      ]),
    ];
    const bound = await planTextAssignment(
      policy,
      assignmentId,
      "Оцени относимость переданных совпадений к конкретному запросу в рамках исходной задачи. " +
        mission.slice(0, 1400),
      paths,
      "Проверка закреплённых совпадений",
      options.knownPaths,
      "screen",
    );
    if (
      !bound.context ||
      (request.kind === "consumer" &&
        bound.context.readPins[request.source] !== options.originPin) ||
      packet.some(
        (w) => w.range.fileSha256 !== bound.context.readPins[w.range.path],
      )
    )
      throw new Error(
        "assignment_search_snapshot_changed: " + paths.join(", "),
      );
    const ranges: Record<string, [number, number][]> = {};
    for (const { range: r } of packet)
      (ranges[r.path] ??= []).push([r.startLine, r.endLine]);
    const ordered = Object.keys(ranges).flatMap((p) =>
      packet.filter((w) => w.range.path === p).map((w) => w.range),
    );
    const material = JSON.stringify({ request, origin });
    const result = await executeIsolatedIdeAudit(
      bound,
      signal,
      ranges,
      undefined,
      material,
      (receipts) => {
        if (!isDeepStrictEqual(receipts, ordered))
          throw new Error("assignment_delivery_incomplete: " + assignmentId);
        options.delivery(
          { assignmentId, ranges: ordered },
          { assignmentId, ranges: receipts },
        );
        record({
          phase: "match-delivery",
          assignmentId,
          request,
          ranges: receipts,
        });
      },
      "screen",
    );
    const verdicts: MatchDecision[] = [];
    for (const w of packet) {
      const decision =
        result.status === "completed"
          ? validMatchDecision(w, result.decisions ?? [])
          : undefined;
      const d = decision ?? {
        path: w.range.path,
        startLine: w.range.startLine,
        line: w.range.startLine,
        kind: "review" as const,
        reason: "Требуется полное чтение для классификации.",
      };
      verdicts.push(d);
      decisions.push(d);
      if (
        d.kind === "review" ||
        (request.kind !== "consumer" && d.kind !== "incidental")
      )
        pending.add(d.path);
    }
    record({
      phase: "match-review",
      assignmentId,
      request,
      decisions: verdicts,
    });
    packet = [];
    bytes = 0;
    scopePaths.clear();
  }
  for (const path of hits.keys()) {
    signal.throwIfAborted();
    let file;
    try {
      file = await readRepositoryFile(policy, path, { signal });
    } catch (error) {
      signal.throwIfAborted();
      pending.add(path);
      record({
        phase: "match-unavailable",
        request,
        path,
        reason: String(error),
      });
      continue;
    }
    const found = locateAuditMatches(
      path,
      file.text,
      file.sha256,
      request,
      options.widerContext ? 24 : 3,
    );
    if (!found.length || found.some((w) => w.range.byteLength > 96 * 1024)) {
      pending.add(path);
      continue;
    }
    for (const w of found) {
      if (
        packet.length &&
        (packet.length >= 32 ||
          bytes + w.range.byteLength > 96 * 1024 ||
          (scopePaths.size >= 16 && !scopePaths.has(path)))
      )
        await flush();
      packet.push(w);
      scopePaths.add(path);
      bytes += w.range.byteLength;
    }
  }
  await flush();
  if (request.kind === "consumer" && !options.widerContext && pending.size) {
    const retryHits = new Map(
      [...hits].filter(
        ([path]) =>
          pending.has(path) &&
          decisions.some((d) => d.path === path && d.kind === "review"),
      ),
    );
    if (retryHits.size) {
      const retry = await screenAuditMatches({
        ...options,
        id: id + ".context",
        hits: retryHits,
        widerContext: true,
      });
      for (const p of retryHits.keys())
        if (!retry.pending.has(p)) pending.delete(p);
      return {
        pending,
        decisions: [
          ...decisions.filter((d) => !retryHits.has(d.path)),
          ...retry.decisions,
        ],
        assignments: number + retry.assignments,
        rejected: retry.rejected,
      };
    }
  }
  return { pending, decisions, assignments: number, rejected: undefined };
}
