/**
 * @file services/ai-control-plane/src/owner-engineering/executeOwnerEngineeringRun.service.ts
 * @version 1.1.0
 * @date 2026-10-23
 * @description Исполняет допущенный инженерный turn с durable журналом, общей авторизацией Codex и платформенным usage.
 * @see documentation/architecture/codex-integration.md
 */
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { OpenAICodexAdapter } from "@realize/codex-adapter";
import type { AgentEvent } from "@realize/ai-contracts";
import { materializeChatAttachments } from "../materializeChatAttachments.service";
import { buildOwnerEngineeringTurn } from "./buildOwnerEngineeringTurn.service";
import { verifyOwnerEngineeringGrant } from "./verifyOwnerEngineeringGrant.validator";
import { OwnerEngineeringRunRepository } from "./OwnerEngineeringRun.repository";
import type {
  OwnerEngineeringRunDependencies,
  OwnerEngineeringRunOutcome,
} from "./OwnerEngineeringRuntime.types";

export const executeOwnerEngineeringRun = async ({
  configuration,
  token,
  run,
  runtime,
  assets,
  registerAdapter,
  onEvent,
}: OwnerEngineeringRunDependencies): Promise<void> => {
  const grant = verifyOwnerEngineeringGrant(run, configuration, token);
  if (!configuration) throw Error("owner_engineering_configuration_required");
  if (run.cancelRequested) return;
  const journal = await new OwnerEngineeringRunRepository(
    configuration.stateRoot,
  ).acquire({
    schemaVersion: "1.0",
    runID: run.id,
    actorID: grant.actorID,
    fingerprint: createHash("sha256").update(JSON.stringify(run)).digest("hex"),
    workspaceRoot: configuration.workspaceRoot,
    osUser: configuration.osUser,
    startedAt: new Date().toISOString(),
    outcome: "started",
  });
  let outcome: OwnerEngineeringRunOutcome = "failed";
  let contextRoot: string | undefined;
  let lease: Awaited<ReturnType<typeof runtime.codex.acquire>> | undefined;
  let completion: AgentEvent | undefined;
  const abort = new AbortController();
  const timer = setTimeout(
    () => abort.abort(),
    Math.max(1, grant.expiresAt - Date.now()),
  );
  timer.unref();
  try {
    lease = await runtime.codex.acquire();
    if (run.cancelRequested) {
      outcome = "cancelled";
      return;
    }
    verifyOwnerEngineeringGrant(run, configuration, token);
    contextRoot = await mkdtemp(join(configuration.stateRoot, "attachments-"));
    const context = await materializeChatAttachments(
      assets,
      run.attachments ?? [],
      run.id,
      contextRoot,
    );
    if (run.cancelRequested) {
      outcome = "cancelled";
      return;
    }
    const search = lease.search.enabled && lease.search.mode === "subagent";
    const turn = buildOwnerEngineeringTurn(
      run,
      configuration,
      context.instructions
        ? `Attachment paths below are relative to ${JSON.stringify(contextRoot)}.\n${context.instructions}`
        : "",
      search,
    );
    const adapter = new OpenAICodexAdapter({
      codexBinary: process.env.REALIZE_CODEX_BINARY || undefined,
      environment: lease.environment,
      signal: AbortSignal.any([lease.signal, abort.signal]),
      ownerHost: {
        workspaceRoot: configuration.workspaceRoot,
        osUser: configuration.osUser,
        attachmentRoot: contextRoot,
        trustedProjectMcp: true,
      },
      search: lease.search,
    });
    registerAdapter(adapter);
    if (run.cancelRequested) {
      outcome = "cancelled";
      return;
    }
    for await (const event of runtime.usage
      .meter(adapter, {
        runId: run.id,
        taskId: run.workflow?.rootRunID ?? run.id,
        source: "chat",
        authMode: lease.authMode,
        model: run.model ?? lease.model,
      })
      .runTurn({
        cwd: configuration.workspaceRoot,
        sandboxProfile: "owner-host",
        images: context.images,
        webSearch: run.webSearch,
        developerInstructions: turn.developerInstructions,
        model: run.model ?? lease.model,
        prompt: turn.prompt,
        runID: run.id,
        // Новый thread исключает наследование tools и полномочий иного профиля.
        ephemeral: true,
      })) {
      if (run.cancelRequested) {
        await adapter.cancelRun(run.id);
        outcome = "cancelled";
        break;
      }
      if (event.type === "assistant.completed") {
        completion = event;
        outcome = "completed";
      } else {
        if (event.type === "run.cancelled") outcome = "cancelled";
        onEvent(event);
      }
    }
    if (run.cancelRequested) outcome = "cancelled";
    if (!completion && outcome !== "cancelled" && run.status !== "failed")
      throw Error("owner_engineering_completion_missing");
  } catch (error) {
    outcome = run.cancelRequested ? "cancelled" : "failed";
    throw error;
  } finally {
    clearTimeout(timer);
    try {
      try {
        await lease?.dispose();
      } finally {
        if (contextRoot)
          await rm(contextRoot, { recursive: true, force: true });
      }
    } catch (error) {
      outcome = "failed";
      throw error;
    } finally {
      await journal.finish(run.cancelRequested ? "cancelled" : outcome);
    }
  }
  // Сначала завершение процесса/lease и durable receipt, затем наблюдаемый успех.
  if (completion && !run.cancelRequested) onEvent(completion);
};
