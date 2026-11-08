/**
 * @file .ai/tools/engineering/src/rewriteTemplateMove.util.ts
 * @version 1.1.1
 * @date 2026-10-29
 * @description Пересчитывает native YAML и локальные Markdown references по offsets без изменения примеров кода.
 * @see documentation/architecture/engineering-operations.md
 */
import { posix } from "node:path";
import { readMarkdownLinkSpans } from "../../quality/readMarkdownLinks.util.ts";
import { isScalar, isSeq, parseDocument } from "yaml";
import type {
  ArtifactMoveTextInput,
  ArtifactTextEdit,
} from "./ProjectArtifactMove.types.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import { applyArtifactTextEdits } from "./applyArtifactTextEdits.util.ts";
import { mapMovedArtifactPath } from "./mapMovedArtifactPath.util.ts";

export function rewriteTemplateMove(input: ArtifactMoveTextInput): string {
  const { path, finalPath, source, from, to } = input;
  const metadata = source.match(
    /^# [^\r\n]+\r?\n\s*```yaml\r?\n([\s\S]*?)\r?\n```(?:\r?\n|$)/,
  );
  if (!metadata)
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Отсутствует native template metadata.",
    );
  const offset = metadata[0].indexOf(metadata[1]);
  const yaml = parseDocument(metadata[1], {
    uniqueKeys: true,
    strict: true,
    stringKeys: true,
  });
  const edits: ArtifactTextEdit[] = [];
  const replaceScalar = (node: unknown, value: string) => {
    if (!isScalar(node) || !node.range || typeof node.value !== "string")
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Metadata reference требует literal scalar.",
      );
    if (node.value !== value)
      edits.push({
        start: offset + node.range[0],
        end: offset + node.range[1],
        text: JSON.stringify(value),
      });
  };
  if (path !== finalPath) {
    replaceScalar(
      yaml.get("template_id", true),
      posix.basename(finalPath, ".md"),
    );
    replaceScalar(
      yaml.get("owner_layer", true),
      posix.dirname(finalPath) + "/",
    );
  }
  const related = yaml.get("related_artifacts", true);
  if (!isSeq(related))
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Нужны literal related_artifacts.",
    );
  for (const item of related.items) {
    if (!isScalar(item) || typeof item.value !== "string")
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Неподдержанный related artifact.",
      );
    replaceScalar(item, mapMovedArtifactPath(item.value, from, to));
  }
  for (const { target: raw, start, end } of readMarkdownLinkSpans(source)) {
    const separator = raw.indexOf("#"),
      rawPath = separator < 0 ? raw : raw.slice(0, separator),
      anchor = separator < 0 ? "" : raw.slice(separator);
    if (!rawPath) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      throw new ProjectArtifactError(
        "INVALID_INPUT",
        "Некорректный URL reference.",
      );
    }
    if (decoded.startsWith("/") || /[?\\\0]/.test(decoded))
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Неподдержанный локальный reference.",
      );
    const resolved = posix.normalize(posix.join(posix.dirname(path), decoded));
    const target = mapMovedArtifactPath(resolved, from, to);
    if (path === finalPath && target === resolved) continue;
    const replacement = posix.relative(posix.dirname(finalPath), target);
    edits.push({ start, end, text: replacement + anchor });
  }
  return applyArtifactTextEdits(source, edits);
}
