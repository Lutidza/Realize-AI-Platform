/**
 * @file .ai/tools/codex-request-diagnostics/src/sourceWireCoverage.service.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Проверяет доставку ожидаемых Markdown фрагментов по фактическому model-visible input без его сохранения.
 */
import type { SmokeSource } from "./smokeCoverage.types.ts";
import type {
  SourceWireInspectReportProof,
  SourceWireSnapshot,
} from "./sourceWireCoverage.types.ts";
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const itemHash = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const MAX_INSPECT_REPORTS = 16;

/** Не сохраняет произвольные поля report: JSON representation существует только в RAM. */
function inspectShape(
  report: Record<string, unknown>,
): Pick<
  SourceWireInspectReportProof,
  "shape" | "reportedCount" | "truncated"
> | null {
  const result = report.result;
  if (
    report.status !== "succeeded" ||
    report.errorCode !== null ||
    !record(result) ||
    result.version !== 1 ||
    result.action !== "inspect" ||
    !["succeeded", "noop"].includes(String(result.status)) ||
    result.errorCode !== null ||
    result.commitCreated !== false ||
    result.pushStatus !== "not_requested" ||
    !record(result.changes) ||
    typeof result.changes.truncated !== "boolean"
  )
    return null;
  const changes = result.changes;
  const truncated = changes.truncated;
  if (typeof truncated !== "boolean") return null;
  if (Array.isArray(changes.items))
    return {
      shape: "full",
      reportedCount: changes.items.length,
      truncated,
    };
  if (
    Object.hasOwn(changes, "items") ||
    !record(report.projection) ||
    report.projection.kind !== "git-inspect-summary" ||
    report.projection.version !== 1 ||
    changes.pathsOmitted !== true ||
    !count(changes.reportedCount) ||
    !record(changes.statusCounts) ||
    !Object.values(changes.statusCounts).every(count) ||
    Object.values(changes.statusCounts).reduce<number>(
      (sum, n) => sum + Number(n),
      0,
    ) !== changes.reportedCount ||
    changes.totalCount !== (truncated ? null : changes.reportedCount)
  )
    return null;
  return {
    shape: "summary",
    reportedCount: changes.reportedCount,
    truncated,
  };
}

/** В состоянии остаются только заранее известные sources, номера строк и counts, а не captured text. */
export class SourceWireCoverage {
  #sources: SmokeSource[];
  #skill: string;
  #lines = new Set<string>();
  #fragments = new Set<string>();
  #proofs: SourceWireSnapshot["sourceProofs"] = [];
  #inspectReports: SourceWireInspectReportProof[] = [];
  #skillCount = 0;
  #incomplete = false;
  constructor(sources: SmokeSource[], skill: string) {
    this.#sources = sources;
    this.#skill = skill;
  }
  observe(body: Buffer, inputItemHashes?: string[]): void {
    try {
      const envelope: unknown = JSON.parse(body.toString("utf8"));
      if (!record(envelope)) return;
      const request =
        envelope.type === "response.create" && record(envelope.response)
          ? envelope.response
          : envelope;
      let visited = 0;
      const packet = (value: Record<string, unknown>) => {
        if (
          !Array.isArray(value.sources) ||
          !Array.isArray(value.pending) ||
          value.sources.length > 3
        )
          return;
        for (const row of value.sources) {
          if (!record(row)) continue;
          const index = this.#sources.findIndex((s) => s.path === row.path);
          const source = this.#sources[index];
          const first = row.startLine,
            last = row.endLine;
          if (
            !source ||
            typeof first !== "number" ||
            typeof last !== "number" ||
            !Number.isSafeInteger(first) ||
            !Number.isSafeInteger(last) ||
            first < source.first ||
            last > source.last ||
            last < first ||
            typeof row.text !== "string"
          )
            continue;
          const expected = source.lines.slice(first - 1, last).join("");
          if (row.text !== expected && row.text !== expected.replace(/\n$/, ""))
            continue;
          const key = `${index}:${first}:${last}`;
          if (this.#fragments.has(key)) continue;
          this.#fragments.add(key);
          this.#proofs.push({
            source: index,
            first,
            last,
            bytes: Buffer.byteLength(row.text),
          });
          for (let n = first; n <= last; n++) this.#lines.add(`${index}:${n}`);
        }
      };
      const objectEnd = (text: string, from: number): number => {
        let depth = 0,
          quoted = false,
          escaped = false;
        for (let i = from; i < text.length; i++) {
          const c = text[i];
          if (quoted) {
            if (escaped) escaped = false;
            else if (c === "\\") escaped = true;
            else if (c === '"') quoted = false;
          } else if (c === '"') quoted = true;
          else if (c === "{" || c === "[") {
            if (++depth > 100) return -1;
          } else if (c === "}" || c === "]") {
            if (--depth === 0) return i + 1;
          }
        }
        return -1;
      };
      let inspectVisited = 0;
      /** Только output текущего tool item; packet sources не являются исполненными inspect. */
      const inspectItem = (output: unknown, hash: unknown): void => {
        const parsedReports = new Set<string>();
        let ordinal = 0;
        const inspectNested = (
          value: unknown,
          depth: number,
          jsonBytes?: number,
        ): void => {
          if (++inspectVisited > 20000 || depth > 12) {
            this.#incomplete = true;
            return;
          }
          if (typeof value === "string") {
            try {
              const parsed: unknown = JSON.parse(value);
              if (typeof parsed !== "string" || parsed !== value)
                inspectNested(parsed, depth + 1, Buffer.byteLength(value));
              return;
            } catch {}
            let from = value.indexOf("{"),
              matches = 0;
            while (from !== -1) {
              if (++matches > 128) {
                this.#incomplete = true;
                break;
              }
              const end = objectEnd(value, from);
              if (end > 0) {
                try {
                  const text = value.slice(from, end);
                  inspectNested(
                    JSON.parse(text),
                    depth + 1,
                    Buffer.byteLength(text),
                  );
                  from = value.indexOf("{", end);
                  continue;
                } catch {}
              }
              from = value.indexOf("{", from + 1);
            }
          } else if (Array.isArray(value)) {
            for (const child of value) inspectNested(child, depth + 1);
          } else if (record(value)) {
            // Примеры report в Markdown reader.sources не доказывают Git execution.
            if (Array.isArray(value.sources) && Array.isArray(value.pending))
              return;
            if (
              value.version === 1 &&
              record(value.command) &&
              value.command.action === "inspect"
            ) {
              const json = JSON.stringify(value);
              if (parsedReports.has(json)) return;
              if (parsedReports.size >= MAX_INSPECT_REPORTS) {
                this.#incomplete = true;
                return;
              }
              parsedReports.add(json);
              ordinal++;
              const shape = inspectShape(value);
              if (!shape || !itemHash(hash)) {
                this.#incomplete = true;
                return;
              }
              const proof: SourceWireInspectReportProof = {
                itemHash: hash,
                ordinal,
                ...shape,
                jsonBytes: jsonBytes ?? Buffer.byteLength(json),
              };
              const prior = this.#inspectReports.find(
                (p) => p.itemHash === hash && p.ordinal === ordinal,
              );
              if (prior) {
                if (JSON.stringify(prior) !== JSON.stringify(proof))
                  this.#incomplete = true;
              } else if (this.#inspectReports.length >= MAX_INSPECT_REPORTS)
                this.#incomplete = true;
              else this.#inspectReports.push(proof);
              return;
            }
            for (const child of Object.values(value))
              inspectNested(child, depth + 1);
          }
        };
        const visible = (content: unknown): void => {
          if (typeof content === "string") inspectNested(content, 0);
          else if (Array.isArray(content))
            for (const child of content)
              if (
                record(child) &&
                ["input_text", "output_text", "text"].includes(
                  String(child.type),
                ) &&
                typeof child.text === "string"
              )
                inspectNested(child.text, 0);
        };
        visible(output);
        if (record(output)) visible(output.content);
      };
      const nested = (value: unknown, depth: number): void => {
        if (++visited > 20000 || depth > 12) {
          this.#incomplete = true;
          return;
        }
        if (typeof value === "string") {
          if (value.includes(this.#skill)) this.#skillCount++;
          try {
            const parsed: unknown = JSON.parse(value);
            if (typeof parsed !== "string" || parsed !== value)
              nested(parsed, depth + 1);
          } catch {}
          const matches = value.matchAll(/\{\s*"sources"\s*:/g);
          let count = 0;
          for (const match of matches) {
            if (++count > 128) {
              this.#incomplete = true;
              break;
            }
            const end = objectEnd(value, match.index!);
            if (end > 0) {
              try {
                nested(JSON.parse(value.slice(match.index, end)), depth + 1);
              } catch {}
            }
          }
        } else if (Array.isArray(value))
          for (const item of value) nested(item, depth + 1);
        else if (record(value)) {
          packet(value);
          for (const item of Object.values(value)) nested(item, depth + 1);
        }
      };
      const textContent = (content: unknown) => {
        if (typeof content === "string") nested(content, 0);
        else if (Array.isArray(content))
          for (const item of content) {
            if (
              record(item) &&
              ["input_text", "output_text", "text"].includes(
                String(item.type),
              ) &&
              typeof item.text === "string"
            )
              nested(item.text, 0);
          }
      };
      textContent(request.instructions);
      if (Array.isArray(request.input))
        for (const [index, item] of request.input.entries()) {
          if (!record(item)) continue;
          if (
            item.type === "message" ||
            (item.type === undefined && typeof item.role === "string")
          )
            textContent(item.content);
          else if (
            ["function_call_output", "custom_tool_call_output"].includes(
              String(item.type),
            )
          ) {
            inspectItem(item.output, inputItemHashes?.[index]);
            textContent(item.output);
            if (record(item.output)) textContent(item.output.content);
          }
        }
    } catch {
      this.#incomplete = true;
    }
  }
  snapshot(): SourceWireSnapshot {
    return {
      readLines: this.#lines.size,
      skillTextFragments: this.#skillCount,
      scanIncomplete: this.#incomplete,
      sourceProofs: structuredClone(this.#proofs),
      inspectReports: structuredClone(this.#inspectReports),
    };
  }
}

/** Объединяет snapshots выбранных caller-ом веток без повторного доступа к payload. */
export function mergeSourceWireSnapshots(
  snapshots: readonly SourceWireSnapshot[],
): SourceWireSnapshot {
  const result: SourceWireSnapshot = {
    readLines: 0,
    skillTextFragments: 0,
    scanIncomplete: false,
    sourceProofs: [],
    inspectReports: [],
  };
  const lines = new Set<string>(),
    fragments = new Set<string>();
  if (snapshots.length > 1024) return { ...result, scanIncomplete: true };
  for (const snapshot of snapshots) {
    result.scanIncomplete ||= snapshot.scanIncomplete;
    if (
      !Number.isSafeInteger(snapshot.skillTextFragments) ||
      snapshot.skillTextFragments < 0
    ) {
      result.scanIncomplete = true;
      continue;
    }
    result.skillTextFragments += snapshot.skillTextFragments;
    for (const proof of snapshot.inspectReports ?? []) {
      if (
        !itemHash(proof.itemHash) ||
        !count(proof.ordinal) ||
        proof.ordinal < 1 ||
        proof.ordinal > MAX_INSPECT_REPORTS ||
        !["summary", "full"].includes(proof.shape) ||
        !count(proof.jsonBytes) ||
        proof.jsonBytes < 1 ||
        !count(proof.reportedCount) ||
        typeof proof.truncated !== "boolean"
      ) {
        result.scanIncomplete = true;
        continue;
      }
      const prior = result.inspectReports.find(
        (p) => p.itemHash === proof.itemHash && p.ordinal === proof.ordinal,
      );
      if (prior) {
        if (
          prior.shape !== proof.shape ||
          prior.jsonBytes !== proof.jsonBytes ||
          prior.reportedCount !== proof.reportedCount ||
          prior.truncated !== proof.truncated
        )
          result.scanIncomplete = true;
      } else if (result.inspectReports.length >= MAX_INSPECT_REPORTS)
        result.scanIncomplete = true;
      else
        result.inspectReports.push({
          itemHash: proof.itemHash,
          ordinal: proof.ordinal,
          shape: proof.shape,
          jsonBytes: proof.jsonBytes,
          reportedCount: proof.reportedCount,
          truncated: proof.truncated,
        });
    }
    for (const proof of snapshot.sourceProofs) {
      if (
        ![proof.source, proof.first, proof.last, proof.bytes].every(
          Number.isSafeInteger,
        ) ||
        proof.source < 0 ||
        proof.first < 1 ||
        proof.last < proof.first ||
        proof.bytes < 0 ||
        proof.last - proof.first > 100000 ||
        fragments.size >= 10000
      ) {
        result.scanIncomplete = true;
        continue;
      }
      const fragment = proof.source + ":" + proof.first + ":" + proof.last;
      if (fragments.has(fragment)) continue;
      fragments.add(fragment);
      result.sourceProofs.push({
        source: proof.source,
        first: proof.first,
        last: proof.last,
        bytes: proof.bytes,
      });
      for (let n = proof.first; n <= proof.last; n++) {
        if (lines.size >= 100000) {
          result.scanIncomplete = true;
          break;
        }
        lines.add(proof.source + ":" + n);
      }
    }
  }
  result.readLines = lines.size;
  return result;
}
