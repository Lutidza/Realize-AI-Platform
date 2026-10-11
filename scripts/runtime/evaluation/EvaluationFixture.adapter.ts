/**
 * @file scripts/runtime/evaluation/EvaluationFixture.adapter.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Создаёт и читает только одноразовый синтетический workspace, не следуя symlinks.
 */
import { mkdir, writeFile, lstat, readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import {
  EVALUATION_FILES,
  hashEvaluationText,
} from "@realize/change-engine/evaluation";

export async function createEvaluationFixture(
  directory: string,
): Promise<void> {
  await mkdir(directory, { recursive: false, mode: 0o700 });
  for (const [path, text] of Object.entries(EVALUATION_FILES)) {
    await mkdir(dirname(join(directory, path)), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(join(directory, path), text, { flag: "wx", mode: 0o600 });
  }
}

/** Неисчерпывающий snapshot запрещён: лимит или необычный файл останавливает проверку. */
export async function readEvaluationFixture(
  directory: string,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  let visited = 0,
    bytes = 0;
  const visit = async (path: string): Promise<void> => {
    if (++visited > 80) throw new Error("EVAL_FIXTURE_ENTRY_LIMIT");
    const absolute = join(directory, path),
      stats = await lstat(absolute);
    if (stats.isSymbolicLink()) throw new Error("EVAL_FIXTURE_SYMLINK");
    if (stats.isDirectory()) {
      for (const name of (await readdir(absolute)).sort())
        await visit(path ? `${path}/${name}` : name);
      return;
    }
    if (
      !stats.isFile() ||
      stats.size > 65_536 ||
      (bytes += stats.size) > 262_144
    )
      throw new Error("EVAL_FIXTURE_SIZE_LIMIT");
    result[path] = hashEvaluationText(await readFile(absolute, "utf8"));
  };
  await visit("");
  return result;
}
