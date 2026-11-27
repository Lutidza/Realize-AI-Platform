/**
 * @file .ai/tools/worker-assignment/src/ideWriteAssignment.contract.ts
 * @version 1.1.0
 * @date 2026-11-27
 * @description Задаёт контракт локального разрешения IDE и ограниченного Assignment для Code Lane.
 * @see documentation/specifications/internal-mcp.md
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  assessExecutionScope,
  templatePackageCandidate,
} from "@realize/change-engine";
import { parseRepositoryPath } from "../../../../services/ai-control-plane/src/repositoryReadPolicy.validator";

const path = z
  .string()
  .min(1)
  .max(240)
  .refine((value) => {
    try {
      return parseRepositoryPath(value) === value && !/[*?[\]{}]/u.test(value);
    } catch {
      return false;
    }
  });
const paths = z
  .array(path)
  .max(64)
  .refine((items) => new Set(items).size === items.length);
const writePaths = paths.refine(
  (affectedPaths) =>
    affectedPaths.length > 0 &&
    affectedPaths.every(
      (path) =>
        templatePackageCandidate(path) ||
        assessExecutionScope({
          affectedPaths: [path],
          checks: [],
          type: "CODE_CHANGE",
        }).allowed,
    ),
  "Требуются точные разрешённые файлы Code Lane.",
);
const role = path.refine(
  (value) => value.startsWith(".ai/roles/") && value.endsWith(".md"),
);
export const ideWriteAuthorizationInput = z.strictObject({
  principalID: z.string().min(1).max(80),
  idempotencyKey: z.string().min(1).max(128),
  task: z.string().trim().min(1).max(2048),
  role,
  writePaths,
  sources: paths.default([]),
});
export const ideWriteGrant = z.strictObject({
  mode: z.literal("scoped-write"),
  baseCommit: z.string().regex(/^[a-f0-9]{40}$/),
  taskSha256: z.hash("sha256"),
  role,
  requiredSources: paths,
  permissions: z.strictObject({
    writePaths,
    output: z.literal("verified-diff"),
  }),
  checks: z.tuple([
    z.literal("scope"),
    z.literal("git diff --check"),
    z.literal("sha256"),
  ]),
});
/** Выдаётся оркестратором из приватного grant. Вход lockPath предназначен только для чтения. */
export const ideWriteAssignment = ideWriteGrant
  .extend({
    id: z.uuid(),
    revision: z.literal(1),
    mission: z.string().min(1),
    assignedBy: z.literal("orchestrator"),
    returnsTo: z.literal("orchestrator"),
    executor: z.literal("ai-execution-worker"),
  })
  .refine((assignment) => assignment.requiredSources.includes(assignment.role));
export type IdeWriteAssignment = z.infer<typeof ideWriteAssignment>;

/** Принимает только полную квитанцию данного Assignment, с тем же набором полномочий и байтами проверенного diff. */
export function verifyIdeWriteReceipt(
  assignment: IdeWriteAssignment,
  value: unknown,
) {
  const receipt = z
    .strictObject({
      runId: z.literal(assignment.id),
      executor: z.literal(assignment.executor),
      baseCommit: z.literal(assignment.baseCommit),
      allowedPaths: paths,
      changedPaths: paths,
      checks: ideWriteGrant.shape.checks,
      diffSha256: z.hash("sha256"),
      diff: z.string().min(1),
    })
    .parse(value);
  if (
    JSON.stringify(receipt.allowedPaths) !==
      JSON.stringify(assignment.permissions.writePaths) ||
    !receipt.changedPaths.length ||
    receipt.changedPaths.some((path) => !receipt.allowedPaths.includes(path)) ||
    createHash("sha256").update(receipt.diff).digest("hex") !==
      receipt.diffSha256
  )
    throw new Error("assignment_write_receipt_mismatch");
  return receipt;
}
