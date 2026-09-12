/**
 * @file services/ai-control-plane/src/contextSnapshot.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Создаёт ограниченный Context Pack из тех же байтов и фильтра, что каталог проекта.
 */
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { matchProjectFiles } from "./matchProjectFiles.validator";
import { collectProjectContext } from "./projectContextCatalog.service";
import type { ContextSnapshot } from "./ProjectContext.types";
export type { ContextSnapshot } from "./ProjectContext.types";

/** Копирует разрешённый контур; явный выбор проверяется по содержимому до запуска модели. */
export const createContextSnapshot = async (
  workspaceRoot: string,
  selected: Array<{ path: string; sha256: string }> = [],
): Promise<ContextSnapshot> => {
  const entries = await collectProjectContext(workspaceRoot);
  const selectedFiles = matchProjectFiles(entries, selected);
  const root = await mkdtemp(join(tmpdir(), "realize-ai-context-"));
  try {
    for (const { file, data } of entries) {
      const target = join(root, file.path);
      await mkdir(dirname(target), { recursive: true, mode: 0o750 });
      await writeFile(target, data, { mode: 0o440, flag: "wx" });
    }
    const totalBytes = entries.reduce((sum, entry) => sum + entry.file.size, 0);
    await writeFile(
      join(root, "CONTEXT_PACK.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          totalBytes,
          files: entries.map(({ file }) => ({
            bytes: file.size,
            path: file.path,
            sha256: file.sha256,
          })),
          selectedFiles,
        },
        null,
        2,
      ),
      { mode: 0o440, flag: "wx" },
    );
    return {
      root,
      fileCount: entries.length,
      totalBytes,
      selectedFiles,
      cleanup: async () => {
        await chmod(root, 0o750);
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
};
