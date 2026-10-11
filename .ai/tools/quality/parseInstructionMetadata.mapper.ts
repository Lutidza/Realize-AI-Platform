/**
 * @file .ai/tools/quality/parseInstructionMetadata.mapper.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет YAML schemas активных metadata и совместимость идентификаторов с S1.
 */
import { parseDocument } from "yaml";
import { z } from "zod";
import { parseAiInstructionDocument } from "../../../services/ai-control-plane/src/parseAiInstructionDocument.util";
import type { InstructionDocument } from "./InstructionQuality.types";

const artifact = z
  .object({
    artifact_id: z
      .string()
      .regex(/^[\w.-]{1,256}$/)
      .optional(),
    rule_id: z
      .string()
      .regex(/^[\w.-]{1,256}$/)
      .optional(),
    check_id: z
      .string()
      .regex(/^[\w.-]{1,256}$/)
      .optional(),
    artifact_type: z.string().min(1).max(128).optional(),
    owner_layer: z.string().min(1).max(256).optional(),
  })
  .passthrough()
  .refine(
    (value) =>
      [value.artifact_id, value.rule_id, value.check_id].filter(Boolean)
        .length === 1,
  );
const entry = z
  .object({
    entry_id: z.string().min(1).max(128),
    entry_type: z.enum(["active_rule", "supporting_check"]),
    status: z.literal("active"),
    primary_artifact: z.string().regex(/^\.ai\/(rules|checks)\/.+\.md$/),
    related_checks: z.array(z.string()).max(100).default([]),
  })
  .passthrough();
const record = z.record(z.string(), z.unknown());

/** S1 остаётся владельцем advisory extractor; CI дополнительно валидирует полный YAML. */
export function parseInstructionMetadata(
  path: string,
  text: string,
): InstructionDocument {
  const chunks = [
    ...text.matchAll(/^```ya?ml[^\n]*\n([\s\S]*?)^```\s*$/gm),
  ].map((x) => x[1]);
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1];
  if (frontmatter !== undefined) chunks.unshift(frontmatter);
  // Примеры после metadata не становятся новыми artifacts или registry entries.
  const values = chunks
    .filter((value, i) => i === 0 || /^entries:/m.test(value))
    .map((value) => {
      const document = parseDocument(value, {
        uniqueKeys: true,
        strict: true,
        stringKeys: true,
      });
      if (document.errors.length || document.warnings.length)
        throw new Error("invalid_yaml");
      return record.parse(document.toJS({ maxAliasCount: 0 }));
    });
  const metadata = values[0] ?? {};
  if (
    /^\.ai\/(?:rules|checks|registry|roles|workflows|system)\//.test(path) ||
    /^\.ai\/(?:README|STRUCTURE)\.md$/.test(path) ||
    Object.keys(metadata).some((key) => /^(artifact|rule|check)_id$/.test(key))
  )
    artifact.parse(metadata);
  if (path.endsWith("/SKILL.md"))
    z.object({ name: z.string().min(1), description: z.string().min(1) })
      .passthrough()
      .parse(metadata);
  if (metadata.status && metadata.status !== "active")
    throw new Error("inactive_artifact_in_active_scope");
  const entries = values.flatMap((value) =>
    value.entries === undefined
      ? []
      : z.array(entry).max(256).parse(value.entries),
  );
  if (
    path.startsWith(".ai/registry/rules/") &&
    path !== ".ai/registry/rules/INDEX.md"
  ) {
    if (
      metadata.schema_version !== 2 ||
      (!entries.length &&
        !(Array.isArray(metadata.coverage) && metadata.coverage.length === 0))
    )
      throw new Error("registry_schema_invalid");
  }
  const advisory = parseAiInstructionDocument(path, text);
  const artifactId = (metadata.artifact_id ??
    metadata.rule_id ??
    metadata.check_id ??
    null) as string | null;
  if (advisory.artifactId !== artifactId)
    throw new Error("s1_identifier_drift");
  return { path, text, metadata, entries, artifactId };
}
