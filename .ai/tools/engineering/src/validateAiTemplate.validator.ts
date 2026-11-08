/**
 * @file .ai/tools/engineering/src/validateAiTemplate.validator.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Проверяет native template metadata без превращения шаблона в active instruction.
 * @see documentation/architecture/engineering-artifacts.md
 */
import { posix } from "node:path";
import { parseDocument } from "yaml";
import { z } from "zod";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import { BASE_AI_TEMPLATE } from "./projectArtifactProfiles.config.ts";

const metadataSchema = z.strictObject({
  template_id: z
    .string()
    .regex(/^TEMPLATE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/)
    .max(128),
  template_type: z.literal("ai-runtime-markdown-template"),
  owner_layer: z.string().min(1).max(1024),
  related_artifacts: z.array(z.string().min(1).max(1024)).min(1).max(64),
});

/** Legacy profiles не переписываются; этот descriptor принимает только свой native subtype. */
export function validateAiTemplate(path: string, source: string) {
  if (
    !/^\.ai\/templates\/(?:[a-z][a-z0-9-]*\/)+TEMPLATE-[A-Z0-9]+(?:-[A-Z0-9]+)*\.md$/.test(
      path,
    )
  )
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Шаблон требует purpose folder и имени TEMPLATE-*.md.",
    );
  const match = source.match(
    /^# ([^\r\n]+)\r?\n\s*```yaml\r?\n([\s\S]*?)\r?\n```(?:\r?\n|$)/,
  );
  if (!match || !/[А-Яа-яЁё]/.test(match[1]))
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Нужны русский заголовок и начальная native YAML metadata.",
    );
  let metadata: z.infer<typeof metadataSchema>;
  try {
    const yaml = parseDocument(match[2], {
      uniqueKeys: true,
      strict: true,
      stringKeys: true,
    });
    if (yaml.errors.length || yaml.warnings.length) throw new Error();
    metadata = metadataSchema.parse(yaml.toJS({ maxAliasCount: 0 }));
  } catch {
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Некорректная native metadata шаблона.",
    );
  }
  if (
    metadata.template_id !== posix.basename(path, ".md") ||
    metadata.owner_layer !== `${posix.dirname(path)}/` ||
    !metadata.related_artifacts.includes(BASE_AI_TEMPLATE)
  )
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Metadata не совпадает с placement или отсутствует базовый template reference.",
    );
  const body = source.slice(match[0].length);
  const sections = body.split(/^##[ \t]+/m).map((section) => {
    const [heading, ...lines] = section.split(/\r?\n/);
    return { heading: heading.trim(), text: lines.join("\n").trim() };
  });
  for (const heading of ["Назначение", "Применение"]) {
    const matches = sections.filter((section) => section.heading === heading);
    if (matches.length !== 1 || !/[А-Яа-яЁё]/.test(matches[0].text))
      throw new ProjectArtifactError(
        "INVALID_INPUT",
        "Шаблон должен содержать заполненные назначение и применение.",
      );
  }
  if (/^```ya?ml[^\n]*\n[\s\S]*?^entries:/m.test(body))
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Registry entries требуют отдельного relationship resolver.",
    );
  return metadata;
}
