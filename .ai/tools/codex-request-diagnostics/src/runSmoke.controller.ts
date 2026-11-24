/**
 * @file .ai/tools/codex-request-diagnostics/src/runSmoke.controller.ts
 * @version 1.0.0
 * @date 2026-11-20
 * @description Запускает bounded stock CLI exec и сохраняет только hash-only evidence и числовые итоги.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { startDiagnosticRelay } from "./diagnosticRelay.adapter.ts";
import { RequestFingerprintObserver } from "./requestFingerprint.service.ts";
import { runCodexExec } from "./codexExec.adapter.ts";
import {
  SourceWireCoverage,
  mergeSourceWireSnapshots,
} from "./sourceWireCoverage.service.ts";
import type { SourceWireSnapshot } from "./sourceWireCoverage.types.ts";
import {
  loadSmokeSources,
  smokeSourceHash,
  SmokeCoverage,
} from "./smokeCoverage.service.ts";
import {
  FULL_ASSIGNMENT,
  EXPECTED_READER_CALLS,
} from "./smokeAssignment.constants.ts";
import type { DiagnosticRelay } from "./diagnosticRelay.types.ts";
import type { CodexExecResult } from "./codexExec.types.ts";
import type {
  RequestFingerprintEvent,
  ResponseUsageEvent,
} from "./requestFingerprint.types.ts";
import type {
  SmokeFailureCode,
  SmokeMode,
  SmokeObservation,
  SmokeRequestObservation,
  SmokePhase,
  SmokePhaseResult,
  SmokeTokenUsage,
  SmokeWireInput,
  SmokeWireSummary,
} from "./runSmoke.types.ts";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const sameUsage = (a: SmokeTokenUsage | null, b: SmokeTokenUsage | null) =>
  a !== null &&
  b !== null &&
  a.inputTokens === b.inputTokens &&
  a.cachedInputTokens === b.cachedInputTokens &&
  a.outputTokens === b.outputTokens;

/** Принимает только полный native CLI usage; отсутствие никогда не превращается в ноль. */
export function smokeCliUsage(value: unknown): SmokeTokenUsage | null {
  if (
    !record(value) ||
    !count(value.input_tokens) ||
    !count(value.cached_input_tokens) ||
    !count(value.output_tokens) ||
    value.cached_input_tokens > value.input_tokens
  )
    return null;
  return {
    inputTokens: value.input_tokens,
    cachedInputTokens: value.cached_input_tokens,
    outputTokens: value.output_tokens,
  };
}

/** Различие A/B добавляется после общего префикса; обязательные тексты по-прежнему читает модель. */
export function smokePrompt(inspects: number): string {
  if (inspects !== 1 && inspects !== 3)
    throw new Error("assignment_contract_changed");
  return (
    FULL_ASSIGNMENT +
    (inspects === 1
      ? "\nЛимит этой ветки: ровно один свежий inspect текущего checkout внутри одного user turn."
      : "\nЛимит этой ветки: ровно три свежих inspect текущего checkout внутри одного user turn. " +
        "Каждый выполняй отдельным command call последовательно; loops, grouping разных inspect и parallel запрещены. " +
        "Это три Git operations в одном CLI; прежний результат не заменяет новый inspect.")
  );
}

/** Выбирает roots и подтверждённых более ранних continuation ancestors того же канала. */
function usedSourceRequests(
  observations: readonly SmokeObservation[],
  roots: readonly SmokeRequestObservation[],
): SmokeRequestObservation[] {
  const requests = observations.filter(
    (row): row is SmokeRequestObservation => row.event.kind === "request",
  );
  const allRequests = new Map(requests.map((row) => [row.event.sequence, row]));
  const ancestors = new Map<string, SmokeRequestObservation | null>();
  for (const { event } of observations) {
    if (
      (event.kind !== "response_created" && event.kind !== "response_usage") ||
      event.correlation === "unknown" ||
      event.generation === "unknown" ||
      event.requestSequence === null ||
      !event.responseIdHash
    )
      continue;
    const prior = allRequests.get(event.requestSequence);
    if (!prior || prior.event.connection !== event.connection) continue;
    if (
      ancestors.has(event.responseIdHash) &&
      ancestors.get(event.responseIdHash)?.event.sequence !==
        prior.event.sequence
    )
      ancestors.set(event.responseIdHash, null);
    else ancestors.set(event.responseIdHash, prior);
  }
  const chosen: SmokeRequestObservation[] = [],
    seen = new Set<number>();
  const visit = (row: SmokeRequestObservation): void => {
    if (seen.has(row.event.sequence)) return;
    seen.add(row.event.sequence);
    chosen.push(row);
    if (row.event.inputMode !== "delta" || !row.event.continuationIdHash)
      return;
    const prior = ancestors.get(row.event.continuationIdHash);
    if (
      !prior ||
      prior.event.sequence >= row.event.sequence ||
      prior.event.connection !== row.event.connection ||
      prior.event.transport !== row.event.transport ||
      (prior.physicalConnection !== undefined &&
        row.physicalConnection !== undefined &&
        prior.physicalConnection !== row.physicalConnection) ||
      (prior.streamIndex !== undefined &&
        row.streamIndex !== undefined &&
        prior.streamIndex !== row.streamIndex)
    )
      return;
    visit(prior);
  };
  for (const row of roots) visit(row);
  return chosen;
}

/** Orphan prewarm не доказывает delivery: объединяются лишь snapshots использованной request closure. */
export function smokeVisibleSources(
  observations: readonly SmokeObservation[],
): SourceWireSnapshot {
  const generated = observations.filter(
    (row): row is SmokeRequestObservation =>
      row.event.kind === "request" && row.event.generation === "generation",
  );
  return mergeSourceWireSnapshots(
    usedSourceRequests(observations, generated).flatMap((row) =>
      row.sourceWire ? [row.sourceWire] : [],
    ),
  );
}

/** Каждый model request обязан следовать подтверждённому TLS того же physical CONNECT в этой фазе. */
export function smokeUpstreamConfirmed(
  observations: readonly SmokeObservation[],
): boolean {
  const connected = new Set<number>();
  let generated = 0;
  for (const row of observations) {
    if (
      row.event.kind === "relay_upstream_attempt" &&
      row.event.outcome === "connected"
    ) {
      if (connected.has(row.event.connection)) return false;
      connected.add(row.event.connection);
    }
    if (row.event.kind === "request") {
      if (
        !("physicalConnection" in row) ||
        row.physicalConnection === undefined ||
        !connected.has(row.physicalConnection)
      )
        return false;
      if (row.event.generation === "generation") generated++;
    }
  }
  return generated > 0;
}

/** Сопоставляет только actual generation requests с уникальными подтверждёнными terminal IDs. */
export function summarizeSmokeWire(input: SmokeWireInput): SmokeWireSummary {
  const requests = input.observations.filter(
    (row): row is SmokeRequestObservation => row.event.kind === "request",
  );
  const generated = requests.filter(
    (row) => row.event.generation === "generation",
  );
  const skillDelivered = usedSourceRequests(
    input.observations,
    generated.slice(0, 1),
  ).some(
    (row) =>
      (row.sourceWire?.skillTextFragments ?? row.skillTextFragments ?? 0) > 0,
  );
  const terminals = input.observations.filter(
    (row): row is SmokeObservation & { event: ResponseUsageEvent } =>
      row.event.kind === "response_usage",
  );
  const bySequence = new Map<number, RequestFingerprintEvent>();
  let duplicateEvidence = 0;
  for (const row of generated) {
    if (bySequence.has(row.event.sequence)) duplicateEvidence++;
    bySequence.set(row.event.sequence, row.event);
  }
  const matched = new Set<number>();
  const ids = new Set<string>();
  let unmatchedTerminals = 0,
    unknownUsage = 0,
    failedTerminals = 0,
    knownTerminals = 0;
  const sum: SmokeTokenUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  };
  let sumValid = true;
  for (const { event } of terminals) {
    if (event.generation === "prewarm") continue;
    if (event.responseIdHash && ids.has(event.responseIdHash)) {
      duplicateEvidence++;
      continue;
    }
    if (event.responseIdHash) ids.add(event.responseIdHash);
    if (
      event.generation !== "generation" ||
      event.requestSequence === null ||
      !event.responseIdHash ||
      event.correlation === "unknown" ||
      !bySequence.has(event.requestSequence)
    ) {
      unmatchedTerminals++;
      continue;
    }
    if (matched.has(event.requestSequence)) {
      duplicateEvidence++;
      continue;
    }
    matched.add(event.requestSequence);
    if (event.terminal !== "completed") failedTerminals++;
    if (
      event.usage.state !== "known" ||
      !count(event.usage.inputTokens) ||
      !count(event.usage.cachedInputTokens) ||
      !count(event.usage.outputTokens) ||
      event.usage.cachedInputTokens > event.usage.inputTokens
    ) {
      unknownUsage++;
      continue;
    }
    knownTerminals++;
    sum.inputTokens += event.usage.inputTokens;
    sum.cachedInputTokens += event.usage.cachedInputTokens;
    sum.outputTokens += event.usage.outputTokens;
    sumValid =
      sumValid &&
      [sum.inputTokens, sum.cachedInputTokens, sum.outputTokens].every(count);
  }
  const models = new Set(
    generated
      .map((row) => row.event.modelHash)
      .filter((hash) => hash !== input.absentModelHash),
  );
  const knownUsage = knownTerminals > 0 && sumValid ? sum : null;
  return {
    generationRequests: generated.length,
    prewarmRequests: requests.filter(
      (row) => row.event.generation === "prewarm",
    ).length,
    unknownRequests: requests.filter(
      (row) => row.event.generation === "unknown",
    ).length,
    fullRequests: generated.filter((row) => row.event.inputMode === "full")
      .length,
    deltaRequests: generated.filter((row) => row.event.inputMode === "delta")
      .length,
    unknownInputRequests: generated.filter(
      (row) => row.event.inputMode === "unknown",
    ).length,
    matchedTerminals: matched.size,
    knownTerminals,
    unmatchedRequests: bySequence.size - matched.size,
    unmatchedTerminals,
    unknownUsage,
    failedTerminals,
    duplicateEvidence,
    coverageEvents: input.observations.filter(
      (row) =>
        row.event.kind === "coverage" || row.event.kind === "relay_coverage",
    ).length,
    policyRejections: input.observations.filter(
      (row) => row.event.kind === "relay_policy_rejection",
    ).length,
    nativeSkillConfirmed: skillDelivered,
    modelHash: models.size === 1 ? [...models][0]! : null,
    modelVariants: models.size,
    knownUsage,
    usageMatches:
      unknownUsage === 0 &&
      unmatchedTerminals === 0 &&
      duplicateEvidence === 0 &&
      matched.size === bySequence.size &&
      knownTerminals === bySequence.size &&
      sameUsage(knownUsage, input.usage),
  };
}

/** Gate не принимает командный статус вместо wire evidence или пропущенных обязательных текстов. */
export function smokePhaseAccepted(
  result: SmokePhaseResult,
  expectedLines: number,
  expectedReaderCalls: number = EXPECTED_READER_CALLS,
): boolean {
  const c = result.coverage,
    w = result.wire,
    execution = result.execution;
  return (
    result.completed &&
    result.ephemeralRequested &&
    result.sourceGuardConfirmed &&
    result.upstreamTlsConfirmed &&
    result.sameInstructions &&
    result.sameSettings &&
    result.sameBuild &&
    result.threadHash !== null &&
    result.threadStarts === 1 &&
    result.completedTurns === 1 &&
    result.failedTurns === 0 &&
    result.nativeEventErrors === 0 &&
    result.usage !== null &&
    execution !== null &&
    execution.exitCode === 0 &&
    execution.exitObserved &&
    execution.groupStopped &&
    !execution.timedOut &&
    execution.errorCode === null &&
    c.commands === expectedReaderCalls + result.expectedInspects &&
    c.runtimeChecks === 1 &&
    c.runtimeChecksPassed === 1 &&
    c.runtimeChecksCombined === 1 &&
    c.inspectCount === result.expectedInspects &&
    c.inspectSuccessfulCount === result.expectedInspects &&
    c.inspectFingerprintHashes.length === result.expectedInspects &&
    c.inspectFingerprintHashes.every(
      (hash) => hash === c.inspectFingerprintHashes[0],
    ) &&
    c.inspectFingerprintHash !== null &&
    !c.modelWorkerUsed &&
    c.inspectCompactCount === result.expectedInspects &&
    c.inspectDiagnosticsDropped === 0 &&
    c.inspectDiagnostics.length === result.expectedInspects &&
    c.inspectDiagnostics.every(
      (row) => row.normalized && row.outputBytes > 0 && row.outputBytes <= 4096,
    ) &&
    c.reads === expectedReaderCalls &&
    c.invalidReads === 0 &&
    c.readerDiagnosticsDropped === 0 &&
    c.readerDiagnostics.length === c.reads &&
    c.readerDiagnostics.every(
      (row, index) =>
        row.call === index + 1 &&
        row.status === "completed" &&
        row.exitCode === 0 &&
        row.errorCode === null &&
        row.reasons.length === 0 &&
        row.outputBytes > 0 &&
        row.outputBytes <= 12288,
    ) &&
    c.duplicateLines === 0 &&
    c.pendingCount === 0 &&
    c.readLines === expectedLines &&
    result.visibleSources.readLines === expectedLines &&
    result.visibleSources.inspectReports.length === result.expectedInspects &&
    result.visibleSources.inspectReports.every(
      (row) =>
        row.shape === "summary" &&
        row.jsonBytes > 0 &&
        row.jsonBytes <= 4096 &&
        row.reportedCount === c.inspectReportedCount &&
        row.truncated === c.inspectTruncated,
    ) &&
    !result.visibleSources.scanIncomplete &&
    w.generationRequests >= (result.expectedInspects === 3 ? 4 : 2) &&
    w.unknownRequests === 0 &&
    w.unknownInputRequests === 0 &&
    w.unmatchedRequests === 0 &&
    w.unmatchedTerminals === 0 &&
    w.unknownUsage === 0 &&
    w.failedTerminals === 0 &&
    w.duplicateEvidence === 0 &&
    w.coverageEvents === 0 &&
    w.nativeSkillConfirmed &&
    w.modelVariants === 1 &&
    w.modelHash !== null &&
    w.usageMatches
  );
}

function buildHash(cwd: string): string {
  const directory = join(cwd, ".ai/tools/codex-request-diagnostics/src");
  const hash = createHash("sha256");
  for (const name of readdirSync(directory)
    .filter((name) => name.endsWith(".ts"))
    .sort()) {
    hash.update(name);
    hash.update("\0");
    hash.update(readFileSync(join(directory, name)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** Выполняет один диагностический CLI либо четыре CLI/шесть operations без скрытых прогревов. */
export async function runSmoke(
  mode: SmokeMode,
  outputPath: string,
): Promise<boolean> {
  const output = await open(outputPath, "wx", 0o600);
  const cwd = process.cwd();
  const key = randomBytes(32);
  const digest = (domain: string, value: string | Buffer) =>
    createHmac("sha256", key)
      .update(domain)
      .update("\0")
      .update(value)
      .digest("hex");
  const settingsHash = () => {
    const hash = createHmac("sha256", key).update("project-settings\0");
    for (const name of [
      ".codex/config.toml",
      ".node-version",
      "package.json",
    ]) {
      hash.update(name);
      hash.update("\0");
      try {
        hash.update(readFileSync(join(cwd, name)));
      } catch (error) {
        if (!record(error) || error.code !== "ENOENT") throw error;
        hash.update("not_present");
      }
      hash.update("\0");
    }
    return hash.digest("hex");
  };
  const observations: SmokeObservation[] = [];
  const results: SmokePhaseResult[] = [];
  const observer = new RequestFingerprintObserver(key);
  let relay: DiagnosticRelay | undefined;
  let phase: SmokePhase = "setup";
  let failed = false,
    observationOverflow = false,
    relayClosed = false,
    cliVersionConfirmed = false;
  let failureCode: SmokeFailureCode = "none";
  let initialSourcesHash: string | null = null,
    initialBuildHash: string | null = null,
    initialSettingsHash: string | null = null;
  let expectedLines = 0;
  const order: Exclude<SmokePhase, "setup" | "cleanup">[] =
    mode === "diagnostic" ? ["D0"] : ["A1", "B1", "A2", "A3"];
  const add = (value: SmokeObservation) => {
    if (observations.length >= 1024) {
      observationOverflow = true;
      return;
    }
    observations.push(value);
  };
  try {
    if (
      !/^Max core file size\s+0\s/m.test(
        readFileSync("/proc/self/limits", "utf8"),
      )
    )
      throw new Error("core_dump_not_disabled");
    if (
      process.env.CODEX_ROLLOUT_TRACE_ROOT ||
      process.env.SSLKEYLOGFILE ||
      process.env.NODE_DEBUG ||
      process.env.NODE_DEBUG_NATIVE ||
      Boolean(process.env.NODE_OPTIONS?.trim()) ||
      process.execArgv.some(
        (arg) => arg.startsWith("--tls-keylog") || arg.startsWith("--inspect"),
      )
    )
      throw new Error("unsafe_trace_environment");
    if (
      execFileSync("codex", ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() !== "codex-cli 0.162.1"
    )
      throw new Error("unsupported_cli_version");
    cliVersionConfirmed = true;
    const sources = loadSmokeSources(cwd);
    expectedLines = sources.reduce(
      (n, source) => n + source.last - source.first + 1,
      0,
    );
    initialSourcesHash = smokeSourceHash(cwd);
    initialBuildHash = buildHash(cwd);
    initialSettingsHash = digest("settings", settingsHash());
    const skillText = readFileSync(
      join(cwd, ".codex/skills/git-commit-push/SKILL.md"),
      "utf8",
    ).replace(/\n$/, "");
    relay = await startDiagnosticRelay({
      request(body, context) {
        const event = observer.observeRequest(body, context);
        if (!event) return;
        let sourceWire: SourceWireSnapshot | undefined;
        if (event.kind === "request") {
          const scanner = new SourceWireCoverage(sources, skillText);
          scanner.observe(body, event.inputItemHashes ?? undefined);
          sourceWire = scanner.snapshot();
        }
        add({
          phase,
          event,
          skillTextFragments: sourceWire?.skillTextFragments ?? 0,
          sourceWire,
          physicalConnection: context.physicalConnection,
          streamIndex: context.streamIndex,
        });
      },
      responseEvent(value, connection, physicalConnection, streamIndex) {
        const event = observer.observeResponseEvent(value, connection);
        if (event) add({ phase, event, physicalConnection, streamIndex });
      },
      upstreamAttempt(event) {
        add({
          phase,
          event: {
            schemaVersion: 1,
            kind: "relay_upstream_attempt",
            connection: event.connection,
            attempt: event.attempt,
            stage: event.stage,
            outcome: event.outcome,
            errorClass: event.errorClass,
            applicationForwarded: false,
          },
        });
      },
      coverage(code, connection, details, failure) {
        // Явная проекция закрытого EOF контракта: никакого spread произвольного callback object.
        const http2Eof = details
          ? {
              clientEnded: details.clientEnded,
              serverEnded: details.serverEnded,
              gotPreface: details.gotPreface,
              clientSettings: details.clientSettings,
              serverSettings: details.serverSettings,
              clientHeaderPending: details.clientHeaderPending,
              serverHeaderPending: details.serverHeaderPending,
              clientBufferBytes: details.clientBufferBytes,
              serverBufferBytes: details.serverBufferBytes,
              serverQueueFrames: details.serverQueueFrames,
              decodedModelStreams: details.decodedModelStreams,
              decodedNonmodelStreams: details.decodedNonmodelStreams,
              unfinishedModelRequests: details.unfinishedModelRequests,
              unfinishedModelResponses: details.unfinishedModelResponses,
              unknownExpectedStreams: details.unknownExpectedStreams,
            }
          : undefined;
        add({
          phase,
          event: {
            schemaVersion: 1,
            kind: "relay_coverage",
            code,
            connection,
            ...(http2Eof ? { http2Eof } : {}),
            ...(failure
              ? {
                  upstreamFailure: {
                    attempt: failure.attempt,
                    stage: failure.stage,
                    errorClass: failure.errorClass,
                    applicationForwarded: false as const,
                  },
                }
              : {}),
          },
        });
      },
      policyRejection(connection) {
        add({
          phase,
          event: {
            schemaVersion: 1,
            kind: "relay_policy_rejection",
            code: "destination_rejected",
            connection,
          },
        });
      },
    });
    let baselineFingerprint: string | null = null,
      baselineModel: string | null = null;
    const threads = new Set<string>();
    for (const label of order) {
      phase = label;
      const expectedInspects = label === "B1" ? 3 : 1;
      const coverage = new SmokeCoverage(sources);
      const from = observations.length;
      let threadHash: string | null = null,
        threadStarts = 0,
        completedTurns = 0,
        failedTurns = 0,
        nativeEventErrors = 0;
      let nativeUsage: SmokeTokenUsage | null = null,
        execution: CodexExecResult | null = null;
      let startedPid: number | null = null,
        invokeFailed = false;
      try {
        execution = await runCodexExec({
          cwd,
          prompt: smokePrompt(expectedInspects),
          environment: relay.childEnvironment,
          started(pid) {
            startedPid = pid;
            process.stdout.write(
              JSON.stringify({ kind: "started", phase, pid }) + "\n",
            );
          },
          event(type, event) {
            if (type === "thread.started") {
              threadStarts++;
              if (
                typeof event.thread_id === "string" &&
                event.thread_id.length > 0 &&
                event.thread_id.length <= 1024
              )
                threadHash = digest("native-thread", event.thread_id);
              else nativeEventErrors++;
            } else if (type === "turn.completed") {
              completedTurns++;
              nativeUsage = smokeCliUsage(event.usage);
              if (!nativeUsage) nativeEventErrors++;
            } else if (type === "turn.failed" || type === "error") {
              failedTurns++;
              const partialUsage = smokeCliUsage(event.usage);
              if (partialUsage) nativeUsage = partialUsage;
            } else if (
              type === "item.completed" &&
              record(event.item) &&
              event.item.type === "command_execution"
            ) {
              coverage.observe({
                type: "commandExecution",
                command: event.item.command,
                aggregatedOutput: event.item.aggregated_output,
                exitCode: event.item.exit_code,
                status: event.item.status,
              });
            }
          },
        });
      } catch {
        invokeFailed = true;
      }
      try {
        await relay.flush();
      } catch {
        invokeFailed = true;
      }
      const snapshot = coverage.snapshot();
      const wire = summarizeSmokeWire({
        observations: observations.slice(from),
        usage: nativeUsage,
        absentModelHash: digest("model", '{"present":false}'),
      });
      let sameInstructions = false,
        sameSettings = false,
        sameBuild = false;
      try {
        sameInstructions = initialSourcesHash === smokeSourceHash(cwd);
        sameSettings =
          initialSettingsHash === digest("settings", settingsHash());
        sameBuild = initialBuildHash === buildHash(cwd);
      } catch {
        invokeFailed = true;
      }
      const result: SmokePhaseResult = {
        phase: label,
        expectedInspects,
        threadHash,
        threadStarts,
        completedTurns,
        failedTurns,
        nativeEventErrors,
        sameInstructions,
        sameSettings,
        sameBuild,
        ephemeralRequested: true,
        sourceGuardConfirmed: cliVersionConfirmed,
        upstreamTlsConfirmed: smokeUpstreamConfirmed(observations.slice(from)),
        completed: !invokeFailed && completedTurns === 1 && failedTurns === 0,
        usage: nativeUsage,
        coverage: snapshot,
        visibleSources: smokeVisibleSources(observations.slice(from)),
        wire,
        execution,
        accepted: false,
      };
      if (startedPid !== null && execution === null) result.completed = false;
      result.accepted =
        !observationOverflow &&
        smokePhaseAccepted(result, expectedLines) &&
        (baselineFingerprint === null ||
          snapshot.inspectFingerprintHash === baselineFingerprint) &&
        (baselineModel === null || wire.modelHash === baselineModel) &&
        threadHash !== null &&
        !threads.has(threadHash);
      results.push(result);
      process.stdout.write(
        JSON.stringify({
          kind: "phase_completed",
          phase,
          accepted: result.accepted,
          usage: nativeUsage,
          knownWireUsage: wire.knownUsage,
          commands: snapshot.commands,
          inspectCount: snapshot.inspectCount,
          readLines: snapshot.readLines,
        }) + "\n",
      );
      if (threadHash) threads.add(threadHash);
      if (!result.accepted) throw new Error("smoke_acceptance_failed");
      baselineFingerprint ??= snapshot.inspectFingerprintHash;
      baselineModel ??= wire.modelHash;
    }
  } catch (error) {
    failed = true;
    const codes: SmokeFailureCode[] = [
      "core_dump_not_disabled",
      "unsafe_trace_environment",
      "unsupported_cli_version",
      "assignment_contract_changed",
      "smoke_acceptance_failed",
    ];
    failureCode =
      error instanceof Error &&
      codes.includes(error.message as SmokeFailureCode)
        ? (error.message as SmokeFailureCode)
        : "experiment_failed";
  } finally {
    phase = "cleanup";
    try {
      if (relay) {
        await relay.close();
        relayClosed = true;
      }
    } catch {
      failed = true;
      failureCode = "relay_cleanup_failed";
    }
    observer.dispose();
    key.fill(0);
  }
  // EOF/flush может обнаружить потерю покрытия после завершения последней CLI-фазы.
  if (
    observations.some(
      (row) =>
        row.event.kind === "coverage" || row.event.kind === "relay_coverage",
    ) ||
    observationOverflow
  ) {
    failed = true;
    if (failureCode === "none") failureCode = "smoke_acceptance_failed";
  }
  const processesStopped = results.every(
    (row) =>
      row.execution !== null &&
      row.execution.exitObserved &&
      row.execution.groupStopped,
  );
  const report = {
    schemaVersion: 8,
    status: failed ? "failed" : "completed",
    failureCode,
    mode,
    executionMode: "stock-cli-exec",
    expectedCliVersion: "0.162.1",
    cliVersionConfirmed,
    ephemeralRequested: true,
    conversationLoggerDisabledBySourceGuard: cliVersionConfirmed,
    globalFileCreationClaimed: false,
    comparison: "three-fresh-cli-vs-one-cli-three-sequential-operations",
    expectedLines,
    expectedReaderCalls: EXPECTED_READER_CALLS,
    sourcesHash: initialSourcesHash,
    buildHash: initialBuildHash,
    settingsHash: initialSettingsHash,
    plan: order,
    results,
    observations,
    observationOverflow,
    finalCoverageComplete:
      !observationOverflow &&
      !observations.some(
        (row) =>
          row.event.kind === "coverage" || row.event.kind === "relay_coverage",
      ),
    processesStopped,
    relayClosed,
    relayMetrics: relay?.snapshot() ?? null,
  };
  try {
    await output.writeFile(JSON.stringify(report) + "\n");
  } finally {
    await output.close();
  }
  process.stdout.write(
    JSON.stringify({
      kind: "completed",
      mode,
      failed,
      phases: results.length,
      observations: observations.length,
      processesStopped,
      relayClosed,
    }) + "\n",
  );
  return !failed;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = process.argv[2],
    output = process.argv[3];
  if (
    !["diagnostic", "ab"].includes(mode) ||
    !output ||
    process.argv.length !== 4
  ) {
    process.stderr.write(
      "usage: runSmoke.controller.ts diagnostic|ab safe-report.json\n",
    );
    process.exitCode = 2;
  } else {
    runSmoke(mode as SmokeMode, resolve(output))
      .then((ok) => {
        if (!ok) process.exitCode = 1;
      })
      .catch(() => {
        process.stderr.write("diagnostic_failed\n");
        process.exitCode = 1;
      });
  }
}
