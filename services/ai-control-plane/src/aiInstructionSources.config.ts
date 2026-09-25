/**
 * @file services/ai-control-plane/src/aiInstructionSources.config.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Задаёт entrypoints существующих registry и бюджеты чтения S1.
 */
import type { AiContextInput } from "../../../packages/ai-contracts/src/AiInstructions.types";

export const AI_INSTRUCTION_CORE = [
  "AGENTS.md",
  ".ai/README.md",
  ".ai/registry/rules/global/INDEX.md",
  ".ai/workflows/core/main-delivery/WORKFLOW.md",
  ".ai/registry/rules/scope-control/INDEX.md",
  "documentation/project-context.md",
  "documentation/architecture/project-structure.md",
] as const;
export const AI_INSTRUCTION_PROFILES: Record<
  AiContextInput["kind"],
  readonly string[]
> = {
  general: [".ai/registry/rules/development/INDEX.md"],
  frontend: [
    ".ai/registry/rules/development/INDEX.md",
    ".ai/registry/rules/development/frontend/INDEX.md",
  ],
  backend: [
    ".ai/registry/rules/development/INDEX.md",
    ".ai/registry/rules/development/backend/INDEX.md",
  ],
  documentation: [".ai/registry/rules/documentation/INDEX.md"],
  system: [
    ".ai/registry/rules/development/INDEX.md",
    ".ai/registry/rules/external-tools/INDEX.md",
    ".ai/registry/rules/worker-runtime/INDEX.md",
    ".ai/registry/rules/documentation/INDEX.md",
  ],
};
export const AI_INSTRUCTION_LIMITS = Object.freeze({
  maxSourceBytes: 131072,
  maxTotalBytes: 2097152,
  maxDepth: 2,
  maxReferences: 128,
});
