/**
 * @file packages/engineering-runtime/src/contracts/engineeringCommands.schemas.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Определяет strict Zod validators всех команд инженерного протокола v1.
 * @see documentation/architecture/engineering-operations.md
 */
import { z } from "zod";
import type { JsonValue } from "./CanonicalEngineeringJson.types.ts";
import { canonicalEngineeringJson } from "./canonicalEngineeringJson.util.ts";
import { ENGINEERING_BOUNDS } from "./engineeringBounds.constants.ts";
import {
  engineeringCursorSchema,
  engineeringPageLimitSchema,
  engineeringPathSchema,
  engineeringRevisionSchema,
  engineeringSha256Schema,
  engineeringTextSchema,
  engineeringUuidSchema,
} from "./engineeringPrimitives.schemas.ts";

const schemaVersion = z.literal(1);
const contentEncodedBytes = 4 * Math.ceil(ENGINEERING_BOUNDS.contentBytes / 3);
const base64Alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Canonical padded base64 исключает несколько transport bodies для одних bytes. */
const contentBytesSchema = z
  .string()
  .max(contentEncodedBytes)
  .refine((value) => {
    if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
      return false;
    const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
    if ((value.length / 4) * 3 - padding > ENGINEERING_BOUNDS.contentBytes)
      return false;
    if (padding === 0) return true;
    const lastValue = base64Alphabet.indexOf(value[value.length - padding - 1]);
    return lastValue >= 0 && lastValue % (padding === 2 ? 16 : 4) === 0;
  }, "Expected canonical base64 within the decoded content byte limit");

const recipeParamsSchema = z.custom<{ [key: string]: JsonValue }>((value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  try {
    canonicalEngineeringJson(value, {
      maxBytes: ENGINEERING_BOUNDS.paramsBytes,
      maxDepth: ENGINEERING_BOUNDS.paramsDepth,
      maxNodes: ENGINEERING_BOUNDS.paramsNodes,
      maxStringBytes: ENGINEERING_BOUNDS.paramsStringBytes,
      maxArrayItems: ENGINEERING_BOUNDS.paramsArrayItems,
      maxObjectKeys: ENGINEERING_BOUNDS.paramsObjectKeys,
    });
    return true;
  } catch {
    return false;
  }
}, "Expected bounded plain JSON recipe parameters");

/** Все actions strict: клиент не передаёт policy overrides или permission flags. */
export const fileActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("create_file"),
    path: engineeringPathSchema,
    artifactKind: engineeringTextSchema(128),
    contentRef: engineeringUuidSchema,
  }),
  z.strictObject({
    kind: z.literal("edit_file"),
    path: engineeringPathSchema,
    expectedSha256: engineeringSha256Schema,
    contentRef: engineeringUuidSchema,
  }),
  z.strictObject({
    kind: z.literal("create_directory"),
    path: engineeringPathSchema,
    purpose: engineeringTextSchema(ENGINEERING_BOUNDS.reasonBytes),
    folderPolicyId: engineeringTextSchema(128),
  }),
  z.strictObject({
    kind: z.literal("move"),
    from: engineeringPathSchema,
    to: engineeringPathSchema,
    expectedVersion: engineeringSha256Schema,
  }),
  z.strictObject({
    kind: z.literal("remove"),
    path: engineeringPathSchema,
    expectedVersion: engineeringSha256Schema,
  }),
]);

export const engineeringIntentSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("file_batch"),
    actions: z.array(fileActionSchema).min(1).max(ENGINEERING_BOUNDS.actions),
  }),
  z.strictObject({
    kind: z.literal("generate"),
    recipeId: engineeringTextSchema(128),
    params: recipeParamsSchema,
  }),
]);

// Preflight идёт до Zod access/clone: циклы, accessors и oversized JSON отвергаются безопасно.
function boundedCommand<Schema extends z.ZodType>(
  schema: Schema,
  maxBytes: number = ENGINEERING_BOUNDS.commandBytes,
) {
  return z
    .unknown()
    .superRefine((value, context) => {
      try {
        canonicalEngineeringJson(value, { maxBytes });
      } catch {
        context.addIssue({
          code: "custom",
          message: "Invalid or oversized command JSON",
        });
      }
    })
    .pipe(schema);
}

/** bytes имеют самостоятельный blob budget; размер metadata ограничен формой DTO. */
export const prepareContentCommandSchema = boundedCommand(
  z.strictObject({
    schemaVersion,
    targetId: engineeringUuidSchema,
    requestId: engineeringUuidSchema,
    mediaType: z.enum([
      "text/plain",
      "application/json",
      "application/octet-stream",
    ]),
    bytes: contentBytesSchema,
    sha256: engineeringSha256Schema,
  }),
  contentEncodedBytes + ENGINEERING_BOUNDS.commandBytes,
);

export const planCommandSchema = boundedCommand(
  z.strictObject({
    schemaVersion,
    targetId: engineeringUuidSchema,
    requestId: engineeringUuidSchema,
    intent: engineeringIntentSchema,
    taskRefs: z.array(engineeringUuidSchema).max(ENGINEERING_BOUNDS.taskRefs),
  }),
);

export const previewCommandSchema = boundedCommand(
  z.strictObject({
    schemaVersion,
    operationId: engineeringUuidSchema,
    planId: engineeringUuidSchema,
    after: engineeringCursorSchema,
    limit: engineeringPageLimitSchema,
  }),
);

export const applyCommandSchema = boundedCommand(
  z.strictObject({
    schemaVersion,
    operationId: engineeringUuidSchema,
    planId: engineeringUuidSchema,
    planHash: engineeringSha256Schema,
    requestId: engineeringUuidSchema,
    expectedRevision: engineeringRevisionSchema,
  }),
);

export const getCommandSchema = boundedCommand(
  z.strictObject({
    schemaVersion,
    operationId: engineeringUuidSchema,
  }),
);

export const cancelCommandSchema = boundedCommand(
  z.strictObject({
    schemaVersion,
    operationId: engineeringUuidSchema,
    requestId: engineeringUuidSchema,
    expectedRevision: engineeringRevisionSchema,
    reason: engineeringTextSchema(ENGINEERING_BOUNDS.reasonBytes),
  }),
);

export const inspectRecoveryCommandSchema = boundedCommand(
  z.strictObject({
    schemaVersion,
    operationId: engineeringUuidSchema,
  }),
);

export const recoverCommandSchema = boundedCommand(
  z.strictObject({
    schemaVersion,
    operationId: engineeringUuidSchema,
    recoveryPlanId: engineeringUuidSchema,
    recoveryPlanHash: engineeringSha256Schema,
    requestId: engineeringUuidSchema,
    expectedRevision: engineeringRevisionSchema,
    action: z.enum(["resume", "compensate", "retain_partial"]),
  }),
);

export const eventsCommandSchema = boundedCommand(
  z.strictObject({
    schemaVersion,
    targetId: engineeringUuidSchema,
    after: engineeringCursorSchema,
    limit: engineeringPageLimitSchema,
  }),
);

/** Имя команды принадлежит transport dispatch и не дублируется в JSON body. */
export const engineeringCommandSchemas = Object.freeze({
  prepareContent: prepareContentCommandSchema,
  plan: planCommandSchema,
  preview: previewCommandSchema,
  apply: applyCommandSchema,
  get: getCommandSchema,
  cancel: cancelCommandSchema,
  inspectRecovery: inspectRecoveryCommandSchema,
  recover: recoverCommandSchema,
  events: eventsCommandSchema,
});
