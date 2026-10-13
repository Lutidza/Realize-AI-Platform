/**
 * @file packages/payload-task-manager/src/contracts/workspace/workspaceArtifactManifest.validator.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет версии артефактов, producer metadata и независимые удержания локального досье.
 * @see documentation/specifications/task-management-execution.md
 */
import { z } from "zod";
import { WORKSPACE_CONTRACT_LIMITS } from "./workspaceContractLimits.constants";
import {
  workspaceHashSchema,
  workspaceMetadataIdSchema,
  workspacePathSchema,
  workspaceReasonSchema,
  workspaceReferencesSchema,
  workspaceRevisionSchema,
  workspaceTimestampSchema,
  workspaceUuidSchema,
} from "./workspaceScalarSchemas.validator";
import { validateWorkspaceUniqueIds } from "./validateWorkspaceUniqueIds.util";

const artifactSchema = z.strictObject({
  id: workspaceUuidSchema,
  revision: workspaceRevisionSchema,
  path: workspacePathSchema,
  category: z.enum([
    "reference",
    "screenshot",
    "snapshot",
    "log",
    "draft",
    "result",
    "temporary",
  ]),
  bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  hash: workspaceHashSchema,
  state: z.enum(["ready", "deleted"]),
  createdAt: workspaceTimestampSchema,
  stageId: workspaceMetadataIdSchema.nullable(),
  attemptId: workspaceUuidSchema.nullable(),
  producer: z
    .strictObject({
      id: workspaceMetadataIdSchema,
      pid: workspaceRevisionSchema.nullable(),
      identity: z
        .strictObject({
          bootId: workspaceUuidSchema,
          startTicks: z.string().regex(/^[0-9]{1,32}$/),
        })
        .nullable(),
      settled: z.boolean(),
    })
    .superRefine((producer, context) => {
      // PID переиспользуется: process identity должна сохраняться вместе с ним.
      if ((producer.pid === null) !== (producer.identity === null)) {
        context.addIssue({
          code: "custom",
          path: ["identity"],
          message:
            "PID и identity должны быть указаны или отсутствовать вместе.",
        });
      }
    }),
  retention: z.strictObject({
    mode: z.enum(["retain", "temporary"]),
    pinned: z.boolean(),
    keepReason: workspaceReasonSchema.nullable(),
    referencedBy: workspaceReferencesSchema,
  }),
});

/**
 * Manifest описывает выбранные версии; ready/deleted не разрешают управление runtime или GC.
 * Адаптер отдельно сверяет пути, bytes, hashes и действующие удержания.
 */
export const workspaceArtifactManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  localDossierId: workspaceUuidSchema,
  revision: workspaceRevisionSchema,
  artifacts: z
    .array(artifactSchema)
    .max(WORKSPACE_CONTRACT_LIMITS.artifacts)
    .superRefine((artifacts, context) =>
      validateWorkspaceUniqueIds(
        artifacts.map((artifact) => artifact.id),
        context,
        "id",
      ),
    ),
});
