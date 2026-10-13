/**
 * @file packages/payload-task-manager/src/contracts/workspace/workspaceScalarSchemas.validator.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет общие скалярные значения локальных metadata без доступа к файловой системе.
 * @see documentation/specifications/task-management-execution.md
 */
import { z } from "zod";
import { WORKSPACE_CONTRACT_LIMITS } from "./workspaceContractLimits.constants";
import { validateWorkspaceUniqueIds } from "./validateWorkspaceUniqueIds.util";

export const workspaceUuidSchema = z.uuid();
export const workspaceRevisionSchema = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER);
export const workspaceTimestampSchema = z.iso.datetime({ offset: true });
export const workspaceHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const workspaceMetadataIdSchema = z
  .string()
  .min(1)
  .max(WORKSPACE_CONTRACT_LIMITS.metadataId)
  .refine(
    (value) =>
      Array.from(value).every(
        (character) =>
          character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      ),
    "Идентификатор содержит управляющий символ.",
  );

// Relative path, traversal и symlink escape проверяет конкретный storage adapter.
export const workspacePathSchema = z
  .string()
  .min(1)
  .max(WORKSPACE_CONTRACT_LIMITS.path);
export const workspaceEvidenceSchema = z
  .string()
  .max(WORKSPACE_CONTRACT_LIMITS.evidence);
export const workspaceReasonSchema = workspaceEvidenceSchema.min(1);
export const workspaceReferencesSchema = z
  .array(workspaceMetadataIdSchema)
  .max(WORKSPACE_CONTRACT_LIMITS.references)
  .superRefine((ids, context) => validateWorkspaceUniqueIds(ids, context));
