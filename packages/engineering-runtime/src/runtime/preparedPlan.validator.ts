/**
 * @file packages/engineering-runtime/src/runtime/preparedPlan.validator.ts
 * @version 1.2.0
 * @date 2026-10-28
 * @description Проверяет frozen output доверенного planner до сохранения или выдачи DTO.
 * @see documentation/architecture/engineering-operations.md
 */
import { z } from "zod";
import {
  engineeringPathSchema,
  engineeringSha256Schema,
  engineeringTextSchema,
} from "../contracts/engineeringPrimitives.schemas.ts";
import { canonicalEngineeringJson } from "../contracts/canonicalEngineeringJson.util.ts";
import type { JsonValue } from "../contracts/EngineeringCommand.types.ts";
import type { PreparedPlan } from "./EngineeringRuntime.types.ts";
import { failure } from "./EngineeringFailure.error.ts";

const refs = z
  .array(
    z.strictObject({
      id: engineeringTextSchema(128),
      version: engineeringTextSchema(256),
    }),
  )
  .max(64);
const schema = z.strictObject({
  targetVersion: engineeringTextSchema(256),
  sourceManifestHash: engineeringSha256Schema,
  policyRefs: refs,
  recipeRefs: refs,
  effects: z
    .array(
      z.strictObject({
        kind: z.enum([
          "create_file",
          "edit_file",
          "create_directory",
          "move",
          "remove",
        ]),
        paths: z.array(engineeringPathSchema).min(1).max(64),
        description: engineeringTextSchema(2048),
        contentSha256: engineeringSha256Schema.nullable().optional(),
        movedArtifacts: z
          .array(
            z.discriminatedUnion("kind", [
              z.strictObject({
                from: engineeringPathSchema,
                to: engineeringPathSchema,
                kind: z.literal("file"),
                sha256: engineeringSha256Schema,
              }),
              z.strictObject({
                from: engineeringPathSchema,
                to: engineeringPathSchema,
                kind: z.literal("directory"),
                sha256: z.null(),
              }),
            ]),
          )
          .min(1)
          .max(32)
          .optional(),
        diff: z
          .string()
          .refine((v) => Buffer.byteLength(v) <= 128 * 1024)
          .nullable(),
      }),
    )
    .max(64),
  checkSelection: z.array(engineeringTextSchema(128)).max(64),
  coverage: z.strictObject({
    complete: z.boolean(),
    limitations: z.array(engineeringTextSchema(2048)).max(64),
  }),
  snapshots: z.array(engineeringSha256Schema).min(1).max(65),
  privateData: z.custom<JsonValue>(),
});

export function validatePreparedPlan(value: unknown): PreparedPlan {
  try {
    canonicalEngineeringJson(value, { maxBytes: 256 * 1024 });
  } catch {
    return failure(
      "LIMIT_EXCEEDED",
      "План превышает допустимый объём или содержит недопустимые данные.",
      "planning",
    );
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    return failure(
      "INVALID_INPUT",
      "Planner вернул некорректный контракт.",
      "planning",
    );
  const p = parsed.data;
  for (const effect of p.effects)
    if (effect.movedArtifacts) {
      const paths = effect.movedArtifacts.flatMap((item) => [
        item.from,
        item.to,
      ]);
      const root = effect.movedArtifacts[0];
      if (
        effect.kind !== "move" ||
        effect.contentSha256 !== null ||
        root.kind !== "directory" ||
        JSON.stringify(paths) !== JSON.stringify(effect.paths) ||
        new Set(paths).size !== paths.length ||
        effect.movedArtifacts.some(
          (item) =>
            (item.from !== root.from &&
              !item.from.startsWith(root.from + "/")) ||
            item.to !== root.to + item.from.slice(root.from.length),
        )
      )
        failure(
          "INVALID_INPUT",
          "Directory move DTO не соответствует полному набору путей.",
          "planning",
        );
    }
  if (
    !p.coverage.complete ||
    p.snapshots.length !== p.effects.length + 1 ||
    p.snapshots[0] !== p.sourceManifestHash
  )
    return failure(
      "CONFLICT",
      "План не содержит полного набора последовательных версий.",
      "planning",
    );
  // Подключение check runner и generator требует следующего проверенного binding.
  if (p.checkSelection.length || p.recipeRefs.length)
    return failure(
      "UNSUPPORTED",
      "Порты генерации и проверок ещё не подключены.",
      "planning",
    );
  return structuredClone(p);
}
