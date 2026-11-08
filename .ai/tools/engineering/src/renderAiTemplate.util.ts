/**
 * @file .ai/tools/engineering/src/renderAiTemplate.util.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Создаёт заполненный AI template в native Markdown/YAML формате без active registry metadata.
 * @see documentation/architecture/engineering-artifacts.md
 */
import { posix } from "node:path";
import { stringify } from "yaml";
import type { AiTemplateInput } from "./ProjectArtifactBinding.types.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import {
  ARTIFACT_LIMITS,
  BASE_AI_TEMPLATE,
} from "./projectArtifactProfiles.config.ts";
import { assertArtifactPath } from "./resolveProjectFolderPolicy.validator.ts";
import { validateAiTemplate } from "./validateAiTemplate.validator.ts";

/** Явный input делает renderer воспроизводимым; ссылки подтверждаются при resolveFile. */
export function renderAiTemplate(input: AiTemplateInput): Uint8Array {
  assertArtifactPath(input.path);
  const prose = [input.titleRu, input.purposeRu, input.usageRu];
  if (
    prose.some(
      (text) =>
        typeof text !== "string" || !text.trim() || !/[А-Яа-яЁё]/.test(text),
    ) ||
    /[\r\n]/.test(input.titleRu) ||
    !Array.isArray(input.sections) ||
    !input.sections.length ||
    input.sections.length > 32 ||
    input.sections.some(
      (section) =>
        typeof section.headingRu !== "string" ||
        /[\r\n]/.test(section.headingRu) ||
        !/[А-Яа-яЁё]/.test(section.headingRu) ||
        typeof section.body !== "string" ||
        !section.body.trim(),
    )
  )
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Template требует заполненного русского назначения, применения и разделов.",
    );
  if (
    !Array.isArray(input.relatedArtifacts) ||
    input.relatedArtifacts.length > 63
  )
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Недопустимые template references.",
    );
  input.relatedArtifacts.forEach(assertArtifactPath);
  const metadata = stringify(
    {
      template_id: input.templateId,
      template_type: "ai-runtime-markdown-template",
      owner_layer: `${posix.dirname(input.path)}/`,
      related_artifacts: [
        ...new Set([BASE_AI_TEMPLATE, ...input.relatedArtifacts]),
      ].sort(),
    },
    { lineWidth: 0 },
  );
  const source = [
    `# ${input.titleRu}`,
    "",
    "```yaml",
    metadata.trimEnd(),
    "```",
    "",
    "## Назначение",
    "",
    input.purposeRu,
    "",
    "## Применение",
    "",
    input.usageRu,
    "",
    ...input.sections.flatMap((section) => [
      `## ${section.headingRu}`,
      "",
      section.body,
      "",
    ]),
  ].join("\n");
  if (Buffer.byteLength(source) > ARTIFACT_LIMITS.contentBytes)
    throw new ProjectArtifactError(
      "LIMIT_EXCEEDED",
      "AI template превышает byte budget.",
    );
  validateAiTemplate(input.path, source);
  return new TextEncoder().encode(source);
}
