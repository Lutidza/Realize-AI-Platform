/**
 * @file .ai/tools/engineering/src/renderSourceTemplate.util.ts
 * @version 1.1.0
 * @date 2026-10-29
 * @description Детерминированно добавляет native TSDoc к заполненному исходнику registered source profile.
 * @see documentation/architecture/engineering-artifacts.md
 */
import type { SourceTemplateInput } from "./ProjectArtifactBinding.types.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import { ARTIFACT_LIMITS } from "./projectArtifactProfiles.config.ts";
import { assertArtifactPath } from "./resolveProjectFolderPolicy.validator.ts";
import { validateSourceArtifact } from "./validateSourceArtifact.validator.ts";

/** Renderer не выдаёт write permission и не заменяет resolver существующих references. */
export function renderSourceTemplate(input: SourceTemplateInput): Uint8Array {
  assertArtifactPath(input.path);
  if (
    typeof input.descriptionRu !== "string" ||
    !/[А-Яа-яЁё]/.test(input.descriptionRu) ||
    /[\r\n]|\*\//.test(input.descriptionRu) ||
    input.descriptionRu.length > 2048 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.createdOn) ||
    typeof input.body !== "string" ||
    !input.body.trim()
  )
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Некорректные параметры source template.",
    );
  const refs = input.seeRefs ?? [];
  if (
    !Array.isArray(refs) ||
    refs.length > 64 ||
    refs.some(
      (ref) =>
        typeof ref !== "string" ||
        !/^documentation\/[A-Za-z0-9_./-]+\.md(?:#[^\s*#]+)?$/.test(ref),
    )
  )
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Некорректные @see template inputs.",
    );
  const source = [
    "/**",
    ` * @file ${input.path}`,
    " * @version 1.0.0",
    ` * @date ${input.createdOn}`,
    ` * @description ${input.descriptionRu}`,
    ...refs.map((ref) => ` * @see ${ref}`),
    " */",
    input.body,
  ].join("\n");
  if (Buffer.byteLength(source) > ARTIFACT_LIMITS.contentBytes)
    throw new ProjectArtifactError(
      "LIMIT_EXCEEDED",
      "Source template превышает byte budget.",
    );
  validateSourceArtifact(input.path, source);
  return new TextEncoder().encode(
    source.endsWith("\n") ? source : `${source}\n`,
  );
}
