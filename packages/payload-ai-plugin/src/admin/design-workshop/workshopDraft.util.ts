/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/workshopDraft.util.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Сравнивает draft и готовит явные операции над виртуальными файлами.
 * @see documentation/specifications/design-workshop.md
 */

import {
  designWorkshopCommands,
  type DesignSnapshot,
  type PrepareDesignChangeInput,
} from "@realize/ai-contracts";

/** Порядок виртуальных файлов не является изменением проекта. */
export function sameWorkshopSnapshot(
  left: DesignSnapshot,
  right: DesignSnapshot,
): boolean {
  const comparable = (snapshot: DesignSnapshot) => ({
    ...snapshot,
    files: [...snapshot.files].sort((a, b) => a.path.localeCompare(b.path)),
  });
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

/** Удаление файла всегда явно входит в prepare; base берётся из загруженной версии, не из draft. */
export function workshopDraftCommand(
  baseRevisionId: string,
  before: DesignSnapshot,
  after: DesignSnapshot,
  summary: string,
): PrepareDesignChangeInput {
  const oldFiles = new Map(
    before.files.map((file) => [file.path, file.content]),
  );
  const newFiles = new Map(
    after.files.map((file) => [file.path, file.content]),
  );
  const operations: PrepareDesignChangeInput["operations"] = [
    ...after.files
      .filter((file) => oldFiles.get(file.path) !== file.content)
      .map((file) => ({ kind: "put" as const, ...file })),
    ...before.files
      .filter((file) => !newFiles.has(file.path))
      .map((file) => ({ kind: "delete" as const, path: file.path })),
  ];
  return designWorkshopCommands.prepare.parse({
    baseRevisionId,
    summary,
    operations,
    brief: after.brief,
    sources: after.sources,
  });
}
