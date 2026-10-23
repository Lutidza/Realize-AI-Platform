/**
 * @file services/ai-control-plane/src/owner-engineering/OwnerEngineeringRuntime.types.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Задаёт доверенную конфигурацию машины и зависимости инженерного запуска владельца.
 * @see documentation/architecture/codex-integration.md
 */
import type { AgentEvent } from "@realize/ai-contracts";
import type { OpenAICodexAdapter } from "@realize/codex-adapter";
import type { ChatAssetStore } from "../ChatAssetStore.repository";
import type { createCodexRuntime } from "../createCodexRuntime.config";
import type { ControlPlaneRun } from "../runStore";

export type OwnerEngineeringConfiguration = {
  enabled: true;
  mode: "owner-host";
  hostname: string;
  osUser: string;
  workspaceRoot: string;
  stateRoot: string;
  ownerIDs: readonly string[];
};

export type OwnerEngineeringRunDependencies = {
  configuration: OwnerEngineeringConfiguration | null;
  token: string;
  run: ControlPlaneRun;
  runtime: Pick<ReturnType<typeof createCodexRuntime>, "codex" | "usage">;
  assets: ChatAssetStore;
  registerAdapter: (adapter: OpenAICodexAdapter) => void;
  onEvent: (event: AgentEvent) => void;
};

export type OwnerEngineeringRunOutcome = "completed" | "failed" | "cancelled";

export type OwnerEngineeringRunReceipt = {
  schemaVersion: "1.0";
  runID: string;
  actorID: string;
  fingerprint: string;
  workspaceRoot: string;
  osUser: string;
  startedAt: string;
  finishedAt?: string;
  outcome: "started" | OwnerEngineeringRunOutcome;
};
