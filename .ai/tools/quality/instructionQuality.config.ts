/**
 * @file .ai/tools/quality/instructionQuality.config.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Объявляет точную область и бюджеты структурного CI gate.
 */
export const INSTRUCTION_ROOTS = [
  "AGENTS.md",
  ".ai/README.md",
  ".ai/STRUCTURE.md",
  ".ai/system",
  ".ai/rules",
  ".ai/checks",
  ".ai/registry",
  ".ai/roles",
  ".ai/workflows",
  ".ai/worker-profiles",
  ".codex/README.md",
  ".codex/STRUCTURE.md",
  ".codex/skills",
  ".codex/agents",
  ".codex/prompts",
] as const;
export const INSTRUCTION_LIMITS = {
  files: 1500,
  fileBytes: 256 * 1024,
  totalBytes: 8 * 1024 * 1024,
};
