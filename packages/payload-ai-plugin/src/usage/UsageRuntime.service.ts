/**
 * @file packages/payload-ai-plugin/src/usage/UsageRuntime.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Связывает metering с сохранённым run/планом и серверной установкой.
 */
import type { CodingAgentAdapter, UsageContext } from "@realize/ai-contracts";
import { usageContextSchema } from "@realize/ai-contracts";
import type { UsageDatabase } from "./UsageStore.types";
import type { UsageRuntimeSource } from "./UsageRuntime.types";
import type { ChatRunContext } from "../chat-context/ChatRunContext.types";
import { UsageLedgerRepository } from "./UsageLedger.repository";
import { MeteredAgentAdapter } from "./MeteredAgent.adapter";
import { withUsageTransaction } from "./withUsageTransaction.adapter";
import { readUsageIdentity } from "./readUsageIdentity.config";
import { measureUsageOperation } from "./measureUsageOperation.service";

export class UsageRuntime {
  constructor(
    private readonly database: UsageDatabase,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  meter(
    adapter: CodingAgentAdapter,
    source: UsageRuntimeSource,
  ): CodingAgentAdapter {
    return new MeteredAgentAdapter(
      adapter,
      new UsageLedgerRepository(this.database),
      async () => ({
        context: await this.context(source),
        provider: "openai-codex",
        requestedModel: source.model ?? null,
        authMode: source.authMode,
      }),
    );
  }

  async measureOperation<T>(
    source: Omit<UsageRuntimeSource, "authMode" | "model">,
    operation: () => Promise<T>,
    succeeded: (value: T) => boolean = () => true,
  ): Promise<T> {
    return measureUsageOperation(
      this.database,
      await this.context({ ...source, authMode: "internal" }),
      operation,
      succeeded,
    );
  }

  private async context(source: UsageRuntimeSource): Promise<UsageContext> {
    return withUsageTransaction(
      this.database,
      async (client) => {
        const identity = readUsageIdentity(this.environment);
        const result = await client.query<{
          id: number;
          requested_by_id: number;
          turn_context: ChatRunContext;
        }>(
          source.runId
            ? "SELECT id,requested_by_id,turn_context FROM realize_ai_runs WHERE id::text=$1"
            : "SELECT r.id,r.requested_by_id,r.turn_context FROM realize_ai_change_requests c JOIN realize_ai_runs r ON r.id::text=c.execution_context->>'sourceRunID' WHERE c.id::text=$1",
          [source.runId ?? source.changeRequestId],
        );
        const row = result.rows[0];
        if (!row) throw new Error("USAGE_SOURCE_RUN_REQUIRED");
        const saved = row.turn_context;
        const profile = saved.agentConfiguration;
        return usageContextSchema.parse({
          schemaVersion: "1.0",
          ...identity,
          actorId: String(row.requested_by_id),
          purpose: "customer_runtime",
          source:
            saved.workflow && source.source === "chat"
              ? "workflow"
              : source.source,
          operationKey: source.operationKey ?? saved.workflow?.stepKey ?? null,
          taskId: source.taskId,
          runId: String(row.id),
          changeRequestId: source.changeRequestId ?? null,
          parentAttemptId: null,
          attemptNumber: 1,
          workflowKey: saved.workflow?.workflowKey ?? null,
          workflowStepKey: saved.workflow?.stepKey ?? null,
          agentProfileKey: profile?.compiled.profile.key ?? null,
          systemReleaseId: saved.systemRelease?.releaseID ?? null,
          systemManifestHash: saved.systemRelease?.manifestHash ?? null,
          overlayReleaseId: profile?.compiled.configReleaseID ?? null,
          overlayManifestHash: profile?.compiled.configManifestHash ?? null,
          modelCatalogRevision: null,
          routerPolicyVersion: null,
          routingDecisionId: null,
          adapterVersion: "codex-app-server:1",
        });
      },
      true,
    );
  }
}
