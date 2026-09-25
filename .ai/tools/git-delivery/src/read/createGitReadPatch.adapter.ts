/**
 * @file .ai/tools/git-delivery/src/read/createGitReadPatch.adapter.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Строит unified hunks из уже проверенных байтов без повторного чтения checkout Git-ом.
 */
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Git } from "../Git.adapter.ts";

/** Временные файлы принадлежат вызову и удаляются после завершения дочернего процесса. */
export async function createGitReadPatch(
  path: string,
  before: Buffer | null,
  after: Buffer | null,
  contextLines: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const root = await mkdtemp(join(tmpdir(), "realize-mcp-diff-"));
  try {
    await writeFile(join(root, "before"), before ?? Buffer.alloc(0), {
      mode: 0o600,
    });
    await writeFile(join(root, "after"), after ?? Buffer.alloc(0), {
      mode: 0o600,
    });
    const raw = await new Git(root, {
      timeoutMs: 10000,
      maxOutputBytes: 5 * 1024 * 1024,
    }).run(
      [
        "diff",
        "--no-index",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--no-renames",
        `--unified=${contextLines}`,
        "--",
        "before",
        "after",
      ],
      { machineRead: true, signal, acceptedExitCodes: [0, 1] },
    );
    const start = raw.search(/^@@ /m);
    if (start < 0) return [];
    const quote = (value: string) =>
      /^[A-Za-z0-9_./-]+$/.test(value) ? value : JSON.stringify(value);
    const header = `diff --git ${quote(`a/${path}`)} ${quote(`b/${path}`)}\n--- ${before === null ? "/dev/null" : quote(`a/${path}`)}\n+++ ${after === null ? "/dev/null" : quote(`b/${path}`)}\n`;
    return raw
      .slice(start)
      .split(/(?=^@@ )/m)
      .filter(Boolean)
      .map((hunk) => header + hunk);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
