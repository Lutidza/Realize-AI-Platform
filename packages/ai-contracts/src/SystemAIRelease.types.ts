/**
 * @file packages/ai-contracts/src/SystemAIRelease.types.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Задаёт системный AI release и закрытый снимок контекста исполнения.
 */
import type { AIChatConfigurationSnapshot } from "./AIChatConfiguration.types";
import type { CapabilityDescriptor } from "./capabilities";

export type SystemAIReleaseReference = {
  releaseID: string;
  manifestHash: string;
};

/** Артефакт владельца платформы; клиент передаёт только reference, не этот документ. */
export type SystemAIRelease = SystemAIReleaseReference & {
  schemaVersion: "1.0";
  version: string;
  projectProfile: string;
  capabilities: readonly CapabilityDescriptor[];
  checkIDs: readonly string[];
  instructions: readonly {
    id: string;
    path: string;
    contentHash: string;
    text: string;
  }[];
  sources: readonly { path: string; contentHash: string }[];
  execution: {
    protectedPrefixes: readonly string[];
    protectedNames: readonly string[];
    checks: readonly string[];
  };
};

/** Сохраняется на CR/job, не выдаётся браузеру; hash также входит в signed capability. */
export type AIExecutionContextSnapshot = {
  schemaVersion: "1.0";
  systemRelease: SystemAIReleaseReference;
  agentConfiguration?: AIChatConfigurationSnapshot;
  sourceRunID: string;
  inputContextHash: string;
  originalRequestHash: string;
  contextHash: string;
};
