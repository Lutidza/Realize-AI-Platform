/**
 * @file .ai/tools/worker-assignment/src/readAssignmentDefinition.service.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Читает закреплённое назначение и сверяет идентичность, область и разрешения.
 */
import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import { RepositoryReadError } from "../../../../services/ai-control-plane/src/RepositoryRead.error";
import { readRepositoryFile } from "../../../../services/ai-control-plane/src/readRepositoryFile.service";
import type { RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import {
  assignmentLockSchema,
  validateAssignmentDefinition,
} from "./validateAssignmentDefinition.validator";

function invalid(message: string): never {
  throw new RepositoryReadError("INVALID_INPUT", message);
}

/** Закреплён именно YAML назначения. Markdown вокруг него можно редактировать независимо. */
export async function readAssignmentDefinition(
  policy: RepositoryReadPolicy,
  lockPath: string,
) {
  const raw = await readRepositoryFile(policy, lockPath, {
    maximumBytes: 65536,
  });
  let value: unknown;
  try {
    value = JSON.parse(raw.text);
  } catch {
    invalid("Файл привязки должен содержать JSON.");
  }
  const lockResult = assignmentLockSchema.safeParse(value);
  if (!lockResult.success) invalid("Некорректная структура файла привязки.");
  const lock = lockResult.data;
  const manifest = await readRepositoryFile(policy, lock.manifestPath, {
    maximumBytes: 131072,
  });
  const candidates = lock.manifestPath.endsWith(".md")
    ? Array.from(
        manifest.text.matchAll(/^```yaml\r?\n([\s\S]*?)^```\r?$/gm),
        (m) => m[1],
      )
    : [manifest.text];
  const matching = candidates.filter(
    (source) =>
      createHash("sha256").update(source).digest("hex") === lock.manifestSha256,
  );
  if (matching.length !== 1)
    throw new RepositoryReadError(
      "CONFLICT",
      `Текст назначения не соответствует закреплённому SHA-256 в ${lock.manifestPath}.`,
    );
  const document = parseDocument(matching[0], { schema: "core" });
  if (document.errors.length || document.warnings.length)
    invalid("Некорректный YAML назначения.");
  let definition: unknown;
  try {
    definition = document.toJS({ maxAliasCount: 0 });
  } catch {
    invalid("Назначение должно содержать явные значения полей.");
  }
  const { assignment, scope } = validateAssignmentDefinition(definition, lock);
  return { assignment, lock, scope, lockSha256: raw.sha256 };
}
