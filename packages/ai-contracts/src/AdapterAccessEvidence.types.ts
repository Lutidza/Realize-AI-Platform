/**
 * @file packages/ai-contracts/src/AdapterAccessEvidence.types.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Публичный тип проверяемого сообщения адаптера для одной попытки.
 * @see documentation/architecture/assignment-adapter/adapter-access-evidence-v1.md
 */
import type { z } from "zod";
import type { adapterAccessEvidenceV1Schema } from "./assignmentAccessEvidence.schemas";

export type AdapterAccessEvidenceV1 = z.infer<
  typeof adapterAccessEvidenceV1Schema
>;
