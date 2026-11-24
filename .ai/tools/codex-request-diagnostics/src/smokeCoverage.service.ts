/**
 * @file .ai/tools/codex-request-diagnostics/src/smokeCoverage.service.ts
 * @version 1.0.0
 * @date 2026-11-20
 * @description Проверяет live command evidence в RAM, возвращая лишь counts, диапазоны и fingerprint hash.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  FIRST_INSPECT_COMMAND,
  INSPECT_COMMAND,
} from "./smokeAssignment.constants.ts";
import type {
  SmokeCoverageSnapshot,
  SmokeInspectDiagnostic,
  SmokeReaderDiagnostic,
  SmokeSource,
} from "./smokeCoverage.types.ts";

const record = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const MAX_READER_DIAGNOSTICS = 32;
const MAX_INSPECT_DIAGNOSTICS = 32;
const nonnegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const definitions: [string, string?][] = [
  ["README.md"],
  [".ai/README.md"],
  [".ai/registry/rules/global/INDEX.md"],
  [".ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md"],
  [".ai/rules/global/RULE-SAFE-COMMAND-PROPOSAL.md"],
  [".ai/checks/pre-implementation/CHECK-SAFE-COMMAND-PROPOSAL.md"],
  [".ai/roles/process-tools-operations/scope-contour-owner/INDEX.md"],
  [
    ".ai/workflows/delivery/git/commit-push/WORKFLOW.md",
    "## Программный inspect",
  ],
  [".ai/rules/git/RULE-GIT-DELIVERY.md", "## Исполнитель и разрешение"],
  [
    ".ai/rules/development/RULE-DEPENDENCY-VERSION-EVIDENCE-BEFORE-INSTALL.md",
    "## Единый runtime проекта",
  ],
  [
    ".ai/rules/worker-runtime/RULE-WORKER-CONTEXT-BUDGET-AND-REUSE.md",
    "## Ожидание процессов и воркеров",
  ],
];

/** Публичные обязательные источники берутся с диска, а не из самодекларации модели. */
export function loadSmokeSources(cwd: string): SmokeSource[] {
  return definitions.map(([path, section]) => {
    const lines =
      readFileSync(join(cwd, path), "utf8").match(/[^\n]*\n|[^\n]+$/g) ?? [];
    const first = section
      ? lines.findIndex((line) => line.trimEnd() === section) + 1
      : 1;
    if (!first) throw new Error("source_section_missing");
    let last = lines.length;
    if (section) {
      const level = section.match(/^#+/)![0].length;
      for (let i = first; i < lines.length; i++) {
        const heading = /^(#+) /.exec(lines[i]);
        if (heading && heading[1].length <= level) {
          last = i;
          break;
        }
      }
    }
    return { path, section, first, last, lines };
  });
}

/** Общий digest обнаруживает изменения обязательных инструкций/skill между фазами. */
export function smokeSourceHash(cwd: string): string {
  const hash = createHash("sha256");
  for (const [path] of [
    ...definitions,
    [".codex/skills/git-commit-push/SKILL.md"],
  ]) {
    hash.update(path);
    hash.update("\0");
    hash.update(readFileSync(join(cwd, path)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** Ни command text, ни stdout, ни прочитанные документы не сохраняются в snapshot. */
export class SmokeCoverage {
  #sources: SmokeSource[];
  #seen = new Set<string>();
  #value: SmokeCoverageSnapshot = {
    commands: 0,
    runtimeChecks: 0,
    runtimeChecksPassed: 0,
    runtimeChecksCombined: 0,
    reads: 0,
    readLines: 0,
    duplicateLines: 0,
    invalidReads: 0,
    maxPacketBytes: 0,
    pendingCount: 0,
    sourceProofs: [],
    readerDiagnostics: [],
    readerDiagnosticsDropped: 0,
    inspectCount: 0,
    inspectCompactCount: 0,
    inspectDiagnostics: [],
    inspectDiagnosticsDropped: 0,
    inspectSucceeded: false,
    inspectFingerprintHash: null,
    inspectFingerprintHashes: [],
    inspectSuccessfulCount: 0,
    inspectReportedCount: null,
    inspectTruncated: null,
    modelWorkerUsed: false,
  };
  constructor(sources: SmokeSource[]) {
    this.#sources = sources;
  }
  observe(item: unknown): void {
    if (!record(item) || item.type !== "commandExecution") return;
    this.#value.commands++;
    const command = typeof item.command === "string" ? item.command : "";
    let simple = command.replace(/^\/(?:usr\/)?bin\/bash -lc /, "");
    if (
      (simple.startsWith("'") && simple.endsWith("'")) ||
      (simple.startsWith('"') && simple.endsWith('"'))
    )
      simple = simple.slice(1, -1);
    const output =
      typeof item.aggregatedOutput === "string" ? item.aggregatedOutput : "";
    if (
      item.status !== "completed" ||
      item.exitCode !== 0 ||
      output.includes("Warning: truncated output")
    )
      this.#value.invalidReads++;
    // Exact command и marker штатного verifier доказывают выполнение, а не обещание в prompt.
    const combinedRuntime = simple === FIRST_INSPECT_COMMAND;
    if (combinedRuntime || simple === "npm run verify:runtime") {
      this.#value.runtimeChecks++;
      if (combinedRuntime) this.#value.runtimeChecksCombined++;
      if (
        item.status === "completed" &&
        item.exitCode === 0 &&
        /^\[runtime\] Node\.js \d+\.\d+\.\d+; npm \d+\.\d+\.\d+; runtime и pins: OK\r?$/m.test(
          output,
        )
      )
        this.#value.runtimeChecksPassed++;
    }
    if (command.includes("git:worker -- inspect")) {
      this.#value.inspectCount++;
      if (combinedRuntime && this.#value.inspectCount !== 1)
        this.#value.invalidReads++;
      const diagnostic: SmokeInspectDiagnostic = {
        call: this.#value.inspectCount,
        outputBytes: Buffer.byteLength(output),
        reportBytes: null,
        reportCount: 0,
        projectionKind: null,
        normalized: false,
        reportedCount: null,
        statusGroups: null,
        statusCountSum: null,
        truncated: null,
        totalCount: null,
        pathsOmitted: false,
      };
      if (this.#value.inspectDiagnostics.length < MAX_INSPECT_DIAGNOSTICS)
        this.#value.inspectDiagnostics.push(diagnostic);
      else this.#value.inspectDiagnosticsDropped++;
      if (![INSPECT_COMMAND, FIRST_INSPECT_COMMAND].includes(simple)) {
        this.#value.invalidReads++;
        return;
      }
      let selected: Record<string, any> | null = null;
      for (const line of output.split("\n")) {
        try {
          const report = JSON.parse(line);
          if (!record(report) || report.command?.action !== "inspect") continue;
          diagnostic.reportCount++;
          selected = diagnostic.reportCount === 1 ? report : null;
          diagnostic.reportBytes =
            diagnostic.reportCount === 1 ? Buffer.byteLength(line) : null;
          const result = report.result;
          this.#value.inspectSucceeded =
            report.status === "succeeded" &&
            report.errorCode === null &&
            result?.status === "succeeded" &&
            result.action === "inspect" &&
            result.errorCode === null &&
            report.worker?.handlerCalls === 1 &&
            report.worker?.threadId === null &&
            report.worker?.turnId === null &&
            report.worker?.instructionBytes === 0 &&
            result.commitCreated === false &&
            result.pushStatus === "not_requested";
          if (this.#value.inspectSucceeded)
            this.#value.inspectSuccessfulCount++;
          this.#value.modelWorkerUsed ||= report.worker?.model !== null;
          this.#value.inspectFingerprintHash =
            typeof result?.fingerprint === "string"
              ? createHash("sha256").update(result.fingerprint).digest("hex")
              : null;
          if (this.#value.inspectFingerprintHash)
            this.#value.inspectFingerprintHashes.push(
              this.#value.inspectFingerprintHash,
            );
          this.#value.inspectReportedCount = Array.isArray(
            result?.changes?.items,
          )
            ? result.changes.items.length
            : Number.isSafeInteger(result?.changes?.reportedCount)
              ? result.changes.reportedCount
              : null;
          this.#value.inspectTruncated =
            typeof result?.changes?.truncated === "boolean"
              ? result.changes.truncated
              : null;
        } catch {
          /* Служебный stdout verify:runtime не является report. */
        }
      }
      if (selected && diagnostic.reportCount === 1) {
        const marker = selected.projection;
        const changes = record(selected.result?.changes)
          ? selected.result.changes
          : null;
        diagnostic.projectionKind =
          marker?.kind === "git-inspect-summary"
            ? "git-inspect-summary"
            : Object.hasOwn(selected, "projection")
              ? "unknown"
              : null;
        if (changes) {
          diagnostic.reportedCount = nonnegativeInteger(changes.reportedCount)
            ? changes.reportedCount
            : null;
          diagnostic.truncated =
            typeof changes.truncated === "boolean" ? changes.truncated : null;
          diagnostic.totalCount = nonnegativeInteger(changes.totalCount)
            ? changes.totalCount
            : null;
          diagnostic.pathsOmitted = changes.pathsOmitted === true;
          if (record(changes.statusCounts)) {
            const counts = Object.values(changes.statusCounts);
            diagnostic.statusGroups = counts.length;
            if (counts.every(nonnegativeInteger)) {
              const sum = counts.reduce((total, count) => total + count, 0);
              if (nonnegativeInteger(sum)) diagnostic.statusCountSum = sum;
            }
          }
        }
        diagnostic.normalized =
          item.status === "completed" &&
          item.exitCode === 0 &&
          !output.includes("Warning: truncated output") &&
          this.#value.inspectSucceeded &&
          selected.version === 1 &&
          selected.result?.version === 1 &&
          selected.worker?.model === null &&
          record(marker) &&
          Object.keys(marker).sort().join("|") === "kind|version" &&
          marker.kind === "git-inspect-summary" &&
          marker.version === 1 &&
          changes !== null &&
          !Object.hasOwn(changes, "items") &&
          diagnostic.pathsOmitted &&
          diagnostic.reportedCount !== null &&
          diagnostic.statusCountSum === diagnostic.reportedCount &&
          diagnostic.truncated !== null &&
          (diagnostic.truncated
            ? changes.totalCount === null
            : changes.totalCount === diagnostic.reportedCount);
        if (diagnostic.normalized) this.#value.inspectCompactCount++;
      }
      return;
    }
    if (command.includes("read-context.mjs")) {
      this.#value.reads++;
      const failed = item.status !== "completed" || item.exitCode !== 0;
      // Из stderr reader допускается только точная строка с известным кодом.
      const error = failed
        ? /^read-context: (INVALID_INPUT|READ_FAILED|LINE_TOO_LARGE)\r?$/m.exec(
            output,
          )
        : null;
      const diagnostic: SmokeReaderDiagnostic = {
        call: this.#value.reads,
        status: ["completed", "failed", "in_progress"].includes(item.status)
          ? item.status
          : "unknown",
        exitCode:
          Number.isSafeInteger(item.exitCode) &&
          item.exitCode >= 0 &&
          item.exitCode <= 255
            ? item.exitCode
            : null,
        outputBytes: Buffer.byteLength(output),
        errorCode: (error?.[1] as SmokeReaderDiagnostic["errorCode"]) ?? null,
        reasons: [],
      };
      if (failed) diagnostic.reasons.push("execution_failed");
      if (output.includes("Warning: truncated output"))
        diagnostic.reasons.push("output_truncated");
      if (this.#value.readerDiagnostics.length < MAX_READER_DIAGNOSTICS)
        this.#value.readerDiagnostics.push(diagnostic);
      else this.#value.readerDiagnosticsDropped++;
      if (
        !simple.startsWith(
          "node .ai/tools/context-reading/read-context.mjs ",
        ) ||
        /[;|`]|\$\(|&&/.test(simple)
      ) {
        diagnostic.reasons.push("command_not_allowed");
        this.#value.invalidReads++;
        return;
      }
      this.#value.maxPacketBytes = Math.max(
        this.#value.maxPacketBytes,
        Buffer.byteLength(output),
      );
      try {
        const packet = JSON.parse(output);
        if (
          !record(packet) ||
          !Array.isArray(packet.sources) ||
          packet.sources.length > 3 ||
          Buffer.byteLength(output) > 12288 ||
          !Array.isArray(packet.pending)
        )
          throw new Error();
        this.#value.pendingCount = packet.pending.length;
        for (const row of packet.sources) {
          const source = this.#sources.findIndex((s) => s.path === row.path);
          const selected = this.#sources[source];
          if (
            !selected ||
            !Number.isSafeInteger(row.startLine) ||
            !Number.isSafeInteger(row.endLine) ||
            row.startLine < selected.first ||
            row.endLine > selected.last ||
            row.endLine < row.startLine ||
            typeof row.text !== "string"
          )
            throw new Error();
          const exact = selected.lines
            .slice(row.startLine - 1, row.endLine)
            .join("");
          if (row.text !== exact && row.text !== exact.replace(/\n$/, ""))
            throw new Error();
          for (let n = row.startLine; n <= row.endLine; n++) {
            const id = `${source}:${n}`;
            if (this.#seen.has(id)) this.#value.duplicateLines++;
            this.#seen.add(id);
          }
          this.#value.sourceProofs.push({
            source,
            first: row.startLine,
            last: row.endLine,
            bytes: Buffer.byteLength(row.text),
          });
        }
        this.#value.readLines = this.#seen.size;
      } catch {
        diagnostic.reasons.push("packet_invalid");
        this.#value.invalidReads++;
      }
      return;
    }
    // Любое обходное чтение/поиск вместо штатного reader делает проверку несопоставимой.
    if (simple !== "npm run verify:runtime") this.#value.invalidReads++;
  }
  snapshot(): SmokeCoverageSnapshot {
    return structuredClone(this.#value);
  }
}
