/**
 * @file packages/ai-contracts/src/assignmentAccessEvidence.schemas.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Проверяет внешний формат подтверждения прав перед выдачей назначения.
 * @see documentation/architecture/assignment-adapter/adapter-access-evidence-v1.md
 */
import { z } from "zod";

const id = z.string().min(1);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const paths = z.array(id).nullable();
const observed = z.boolean().nullable();

/** Строгая схема: статус приёмки принадлежит оркестратору, в сообщении адаптера его нет. */
export const adapterAccessEvidenceV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  assignmentId: id,
  revision: z.number().int().positive(),
  contextId: id,
  lockSha256: hash,
  attemptId: id,
  executor: z.strictObject({
    adapterId: id,
    providerId: id,
    selection: z.strictObject({ kind: z.enum(["model", "profile"]), id }),
    observedVersion: id.nullable(),
  }),
  preparedSources: z.array(
    z.strictObject({
      path: id,
      sha256: hash,
      bytes: z.number().int().nonnegative(),
    }),
  ),
  access: z.strictObject({
    coverage: z.enum(["complete", "partial", "unknown"]),
    routes: z
      .array(
        z.strictObject({
          tool: id,
          via: z.enum(["direct", "nested", "deferred"]),
        }),
      )
      .nullable(),
    readPaths: paths,
    writePaths: paths,
    readsPinned: observed,
    outsideReadDenied: observed,
    writeDenied: observed,
  }),
  observations: z.array(
    z.strictObject({
      kind: z.enum([
        "tool-catalog",
        "dispatch-policy",
        "read-probe",
        "denial-probe",
      ]),
      evidenceId: id,
    }),
  ),
  binding: z
    .strictObject({ kind: z.enum(["session", "request"]), id })
    .nullable(),
  issues: z.array(z.strictObject({ code: id, reason: id })),
});
