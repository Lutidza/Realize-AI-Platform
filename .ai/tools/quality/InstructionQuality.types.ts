/**
 * @file .ai/tools/quality/InstructionQuality.types.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Задаёт bounded evidence структурной проверки активных инструкций.
 */
export type InstructionIssue = { path: string; code: string; detail: string };
export type InstructionDocument = {
  path: string;
  text: string;
  metadata: Record<string, unknown>;
  entries: Record<string, unknown>[];
  artifactId: string | null;
};
export type InstructionQualityReport = {
  schemaVersion: "1.0";
  status: "passed" | "failed";
  sourceHash: string;
  files: number;
  bytes: number;
  links: number;
  issues: InstructionIssue[];
  semanticReview: "required";
};
