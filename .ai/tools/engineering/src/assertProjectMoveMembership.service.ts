/**
 * @file .ai/tools/engineering/src/assertProjectMoveMembership.service.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Проверяет сохранение TypeScript entrypoints явных projects при виртуальном переносе.
 * @see documentation/architecture/engineering-operations.md
 */
import type { SynchronousImportReadContext } from "../../agent-search/src/ImportResolution.types.d.mts";
import { loadImportProjectFilesSync } from "../../agent-search/src/loadImportProjectFiles.service.mjs";
import type { SourceMoveResolverInput } from "./ProjectArtifactMove.types.ts";
import { mapMovedArtifactPath } from "./mapMovedArtifactPath.util.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";

/** Native selectors не переписываются; изменение membership требует отдельного контракта. */
export function assertProjectMoveMembership(
  input: SourceMoveResolverInput,
  before: SynchronousImportReadContext,
  after: SynchronousImportReadContext,
  finalFiles: ReadonlySet<string>,
): void {
  for (const configPath of input.tsconfigWrite?.projectConfigPaths ?? []) {
    const original = loadImportProjectFilesSync(
      before,
      configPath,
      input.files,
    );
    const final = loadImportProjectFilesSync(after, configPath, finalFiles);
    if (original.reason || final.reason)
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        `Project root selection: ${original.reason ?? final.reason}.`,
      );
    const expected = new Set(
      original.files.map((path) =>
        mapMovedArtifactPath(path, input.from, input.to),
      ),
    );
    if (
      expected.size !== final.files.length ||
      final.files.some((path) => !expected.has(path))
    )
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Move меняет root membership явного TypeScript project.",
      );
  }
}
