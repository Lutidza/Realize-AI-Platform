/**
 * @file services/ai-control-plane/src/AiInstructionSource.types.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Описывает внутренние метаданные и очередь обхода источников S1.
 */
import type { AiInstructionSourceDto } from "../../../packages/ai-contracts/src/AiInstructions.types";

export type AiInstructionClassification = Pick<
  AiInstructionSourceDto,
  "authority" | "category"
>;
export type AiInstructionDocument = {
  artifactId: string | null;
  inactive: boolean;
  references: string[];
  referencesOmitted: number;
};
export type AiInstructionCandidate = {
  path: string;
  from: string | null;
  selection: AiInstructionSourceDto["selection"];
  depth: number;
  optional?: boolean;
};
