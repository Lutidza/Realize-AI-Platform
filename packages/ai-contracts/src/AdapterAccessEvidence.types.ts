/**
 * @file packages/ai-contracts/src/AdapterAccessEvidence.types.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Публичный тип проверяемого сообщения адаптера для одной попытки.
 * @see documentation/architecture/assignment-adapter/article-audit-evidence.md
 */
import type { z } from "zod";
import type { adapterAccessEvidenceV1Schema } from "./assignmentAccessEvidence.schemas";

export type AdapterAccessEvidenceV1 = z.infer<
  typeof adapterAccessEvidenceV1Schema
>;
