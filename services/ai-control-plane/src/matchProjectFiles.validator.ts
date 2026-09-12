/**
 * @file services/ai-control-plane/src/matchProjectFiles.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет выбранные хеши по разрешённым байтам проекта.
 */
import type { ProjectContextFileDto } from "@realize/ai-contracts";
import type { ProjectContextEntry } from "./ProjectContext.types";
/** Повторно подтверждает, что выбранный файл остался внутри разрешённого контура. */
export const matchProjectFiles = (
  entries: ProjectContextEntry[],
  selected: Array<{ path: string; sha256: string }>,
): ProjectContextFileDto[] =>
  selected.map((reference) => {
    const entry = entries.find(
      ({ file }) =>
        file.path === reference.path && file.sha256 === reference.sha256,
    );
    if (!entry)
      throw new Error(
        "Selected project file changed or is unavailable. Select it again.",
      );
    return entry.file;
  });
