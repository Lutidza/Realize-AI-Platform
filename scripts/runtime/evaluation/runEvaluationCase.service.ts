/**
 * @file scripts/runtime/evaluation/runEvaluationCase.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Выполняет один настоящий Codex turn с durable metering и проверяемым filesystem evidence.
 */
import { randomUUID } from "node:crypto";
import type { AgentReadTools, UsageAttempt } from "@realize/ai-contracts";
import {
  evaluationCaseSchema,
  type EvaluationCase,
} from "@realize/ai-contracts/evaluation";
import { OpenAICodexAdapter } from "@realize/codex-adapter";
import {
  MeteredAgentAdapter,
  EvaluationAdmissionRepository,
  readUsageIdentity,
  type UsageWriter,
} from "@realize/payload-ai-control/server/usage";
import {
  buildEvaluationInstructions,
  EVALUATION_FILES,
  EVALUATION_SCENARIOS,
  hashEvaluationText,
} from "@realize/change-engine/evaluation";
import type { EvaluationCaseInput } from "./EvaluationRuntime.types";
import {
  createEvaluationFixture,
  readEvaluationFixture,
} from "./EvaluationFixture.adapter";

export async function runEvaluationCase({
  runtime,
  directory,
  scenarioId,
  repeat,
}: EvaluationCaseInput): Promise<EvaluationCase> {
  await createEvaluationFixture(directory);
  const before = await readEvaluationFixture(directory);
  const scenario = EVALUATION_SCENARIOS.find((item) => item.id === scenarioId)!;
  const instructions = buildEvaluationInstructions(scenarioId);
  const runId = randomUUID(),
    started = performance.now();
  const result: EvaluationCase = {
    scenarioId,
    repeat,
    runId,
    attemptId: null,
    instructionsHash: hashEvaluationText(instructions.instructions),
    overlayReleaseId: instructions.overlayReleaseId,
    overlayManifestHash: instructions.overlayManifestHash,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    outcome: "not_started",
    stopReason: "none",
    before,
    after: {},
    sourceCalls: [],
    tools: [],
    output: "",
    usage: null,
  };
  const abort = new AbortController();
  const stop = (reason: EvaluationCase["stopReason"]) => {
    if (result.stopReason === "none") result.stopReason = reason;
    abort.abort();
  };
  const timeout = setTimeout(
    () => stop("timeout"),
    runtime.budget.turnTimeoutMs,
  );
  const signal = AbortSignal.any([
    abort.signal,
    runtime.signal,
    runtime.lease.signal,
  ]);
  let latest: UsageAttempt | undefined;
  const writer: UsageWriter = {
    begin: async (input) => {
      latest = await runtime.writer.begin(input);
      result.attemptId = latest.attemptId;
      if (runtime.budget.unknownCost === "deny") {
        try {
          await new EvaluationAdmissionRepository({
            pool: runtime.pool,
          }).requireReservation(latest);
        } catch (error) {
          result.stopReason = "admission_failed";
          latest = (
            await runtime.writer.observe({
              schemaVersion: "1.0",
              eventId: `${latest.attemptId}:admission-denied`,
              attemptId: latest.attemptId,
              sequence: 1,
              observedAt: new Date().toISOString(),
              outcome: "failed",
              model: latest.model,
              tokens: latest.tokens,
              durationMs: 0,
              toolDurationMs: null,
              coverage: "unknown",
              providerEvidence: null,
            })
          ).attempt;
          throw error;
        }
      }
      return latest;
    },
    observe: async (input) => {
      try {
        const observed = await runtime.writer.observe(input);
        latest = observed.attempt;
        if (
          input.tokens.totalTokens !== null &&
          runtime.onTokens(input.attemptId, input.tokens.totalTokens)
        )
          stop("token_limit");
        return observed;
      } catch (error) {
        stop("ledger_failure");
        throw error;
      }
    },
  };
  const readTools: AgentReadTools | undefined = scenario.writable
    ? undefined
    : {
        definitions: [
          {
            name: "repo_read_file",
            description:
              "Прочитать server source data/source.json; временную ошибку можно повторить один раз.",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", enum: ["data/source.json"] },
              },
              required: ["path"],
              additionalProperties: false,
            },
          },
        ],
        execute: async (call) => {
          if (result.sourceCalls.length >= 16) {
            stop("tool_limit");
            throw new Error("EVAL_TOOL_LIMIT");
          }
          if (
            call.name !== "repo_read_file" ||
            JSON.stringify(call.arguments) !==
              JSON.stringify({ path: "data/source.json" })
          ) {
            result.sourceCalls.push({ status: "rejected", contentHash: null });
            return { ok: false, code: "forbidden" };
          }
          if (!result.sourceCalls.length) {
            result.sourceCalls.push({
              status: "unavailable",
              contentHash: null,
            });
            return {
              ok: false,
              code: "temporarily_unavailable",
              retryable: true,
            };
          }
          const text = EVALUATION_FILES["data/source.json"],
            hash = hashEvaluationText(text);
          result.sourceCalls.push({ status: "returned", contentHash: hash });
          return { ok: true, path: "data/source.json", sha256: hash, text };
        },
      };
  const adapter = new OpenAICodexAdapter({
    codexBinary: runtime.environment.REALIZE_CODEX_BINARY || undefined,
    environment: runtime.lease.environment,
    signal,
    search: {
      enabled: false,
      mode: "direct",
      model: "",
      developerInstructions: false,
    },
    readTools,
  });
  const identity = readUsageIdentity(runtime.environment);
  const metered = new MeteredAgentAdapter(adapter, writer, async () => ({
    provider: "openai-codex",
    requestedModel: runtime.model,
    authMode: runtime.lease.authMode,
    context: {
      schemaVersion: "1.0",
      installationId: identity.installationId,
      projectId: identity.projectId,
      actorId: null,
      purpose: "evaluation",
      source: "evaluation",
      taskId: runtime.taskId,
      operationKey: `${scenarioId}:${repeat}`,
      runId,
      changeRequestId: null,
      parentAttemptId: null,
      attemptNumber: 1,
      workflowKey: "realize-agent-core",
      workflowStepKey: scenarioId,
      agentProfileKey: "eval",
      platformReleaseId: identity.platformReleaseId,
      systemReleaseId: runtime.candidate.systemReleaseId,
      systemManifestHash: runtime.candidate.systemManifestHash,
      overlayReleaseId: instructions.overlayReleaseId,
      overlayManifestHash: instructions.overlayManifestHash,
      modelCatalogRevision: null,
      routerPolicyVersion: null,
      routingDecisionId: null,
      adapterVersion: runtime.candidate.adapterVersion,
    },
  }));
  try {
    if (signal.aborted) throw new Error("EVAL_CANCELLED");
    for await (const event of metered.runTurn({
      cwd: directory,
      developerInstructions: instructions.instructions,
      ephemeral: true,
      model: runtime.model,
      prompt: scenario.prompt,
      runID: runId,
      sandboxProfile: scenario.writable
        ? "code-workspace-write"
        : "analysis-readonly",
      webSearch: false,
    })) {
      if (event.type === "run.started") result.outcome = "failed";
      if (event.type === "assistant.delta") {
        if (Buffer.byteLength(result.output + event.delta) > 32_768) {
          stop("output_limit");
          break;
        }
        result.output += event.delta;
      }
      if (event.type === "tool.started" || event.type === "tool.completed") {
        if (result.tools.length >= 64) {
          stop("tool_limit");
          break;
        }
        result.tools.push({
          phase: event.type === "tool.started" ? "started" : event.status,
          summary: event.summary.slice(0, 1000),
        });
      }
      if (event.type === "assistant.completed") {
        if (Buffer.byteLength(event.content) > 32_768) {
          stop("output_limit");
          break;
        }
        result.output = event.content;
        result.outcome = "completed";
      }
      if (event.type === "run.failed") {
        result.outcome = "failed";
        if (result.stopReason === "none")
          result.stopReason = "provider_failure";
      }
      if (event.type === "run.cancelled") {
        result.outcome = "cancelled";
        if (result.stopReason === "none")
          result.stopReason = runtime.signal.aborted
            ? "suite_budget"
            : "provider_failure";
      }
    }
  } catch {
    result.outcome = result.attemptId ? "failed" : "not_started";
    if (result.stopReason === "none")
      result.stopReason = result.attemptId
        ? "provider_failure"
        : "admission_failed";
  } finally {
    clearTimeout(timeout);
    await adapter.cancelRun(runId).catch(() => undefined);
  }
  result.durationMs = Math.round(performance.now() - started);
  try {
    result.after = await readEvaluationFixture(directory);
  } catch {
    result.after = {};
    result.outcome = "failed";
    if (result.stopReason === "none") result.stopReason = "output_limit";
  }
  if (latest)
    result.usage = {
      coverage: latest.coverage,
      tokens: latest.tokens,
      model: latest.model,
      costs: latest.costs,
    };
  return evaluationCaseSchema.parse(result);
}
