/**
 * @file packages/payload-task-manager/src/contracts/workspace/workspaceResult.validator.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет manifest сданного результата по точным версиям артефактов и evidence проверок.
 * @see documentation/specifications/task-management-execution.md
 */
import { z } from "zod";
import { WORKSPACE_CONTRACT_LIMITS } from "./workspaceContractLimits.constants";
import {
  workspaceEvidenceSchema,
  workspaceHashSchema,
  workspaceMetadataIdSchema,
  workspaceRevisionSchema,
  workspaceTimestampSchema,
  workspaceUuidSchema,
} from "./workspaceScalarSchemas.validator";
import { validateWorkspaceUniqueIds } from "./validateWorkspaceUniqueIds.util";

/** Сдача результата не является приёмкой; refs и checks относятся к этой ревизии manifest. */
export const workspaceResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  localDossierId: workspaceUuidSchema,
  revision: workspaceRevisionSchema,
  criteriaHash: workspaceHashSchema,
  submittedAt: workspaceTimestampSchema,
  summary: z.string().min(1).max(WORKSPACE_CONTRACT_LIMITS.summary),
  artifacts: z
    .array(
      z.strictObject({
        id: workspaceUuidSchema,
        revision: workspaceRevisionSchema,
        hash: workspaceHashSchema,
      }),
    )
    .max(WORKSPACE_CONTRACT_LIMITS.artifacts)
    .superRefine((artifacts, context) =>
      validateWorkspaceUniqueIds(
        artifacts.map((artifact) => artifact.id),
        context,
        "id",
      ),
    ),
  checks: z
    .array(
      z.strictObject({
        id: workspaceMetadataIdSchema,
        status: z.enum(["passed", "failed", "not_required"]),
        evidence: workspaceEvidenceSchema,
      }),
    )
    .max(WORKSPACE_CONTRACT_LIMITS.checks)
    .superRefine((checks, context) =>
      validateWorkspaceUniqueIds(
        checks.map((check) => check.id),
        context,
        "id",
      ),
    ),
});
