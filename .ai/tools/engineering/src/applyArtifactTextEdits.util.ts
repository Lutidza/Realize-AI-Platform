/**
 * @file .ai/tools/engineering/src/applyArtifactTextEdits.util.ts
 * @version 1.0.0
 * @date 2026-10-28
 * @description Применяет непересекающиеся правки по исходным offsets, сохраняя остальные bytes и line endings.
 * @see documentation/architecture/engineering-operations.md
 */
import type { ArtifactTextEdit } from "./ProjectArtifactMove.types.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";

export function applyArtifactTextEdits(
  source: string,
  edits: readonly ArtifactTextEdit[],
): string {
  let end = source.length;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (
      !Number.isSafeInteger(edit.start) ||
      !Number.isSafeInteger(edit.end) ||
      edit.start < 0 ||
      edit.start > edit.end ||
      edit.end > end
    )
      throw new ProjectArtifactError(
        "CONFLICT",
        "Текстовые правки пересекаются или выходят за исходный текст.",
      );
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    end = edit.start;
  }
  return source;
}
