/**
 * @file services/ai-control-plane/src/walkRepository.service.ts
 * @version 1.0.1
 * @date 2026-10-20
 * @description Обходит разрешённые metadata репозитория с ограничением числа entries.
 */
import { lstat, opendir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { openRepositoryDirectory } from "./openRepositoryDirectory.adapter";
import { RepositoryReadError } from "./RepositoryRead.error";
import type {
  RepositoryDirectory,
  RepositoryReadPolicy,
  RepositoryWalk,
  RepositoryWalkOptions,
} from "./RepositoryRead.types";
import { assertRepositoryReadActive } from "./readRepositoryFile.service";
import {
  isRepositoryPathAllowed,
  parseRepositoryPath,
  REPOSITORY_MAX_FILE_BYTES,
  REPOSITORY_MAX_SCAN_ENTRIES,
  REPOSITORY_ROOT_DIRECTORIES,
  REPOSITORY_ROOT_FILES,
} from "./repositoryReadPolicy.validator";

/** Отказанные пути не попадают в snapshot; symlink parents проверяются до readdir. */
export async function walkRepository(
  policy: RepositoryReadPolicy,
  options: RepositoryWalkOptions = {},
): Promise<RepositoryWalk> {
  const base = parseRepositoryPath(options.path ?? "", true);
  if (base && !isRepositoryPathAllowed(policy, base))
    throw new RepositoryReadError(
      "FORBIDDEN",
      "Путь недоступен политике чтения.",
    );
  const result: RepositoryWalk = {
    entries: [],
    truncated: false,
    inspectedEntries: 0,
  };
  const limit = Math.min(
    options.maxEntries ?? REPOSITORY_MAX_SCAN_ENTRIES,
    REPOSITORY_MAX_SCAN_ENTRIES,
  );
  const depth = options.depth ?? Number.MAX_SAFE_INTEGER;
  async function visit(
    path: string,
    level: number,
    include = true,
    heldParent?: RepositoryDirectory,
    assertAncestorCheckouts?: () => Promise<void>,
  ): Promise<void> {
    assertRepositoryReadActive(options.signal);
    if (result.inspectedEntries >= limit) {
      result.truncated = true;
      return;
    }
    result.inspectedEntries++;
    if (!isRepositoryPathAllowed(policy, path)) return;
    try {
      // DFS удерживает проверенного родителя до завершения детей; повторное открытие цепочки не нужно.
      const parent =
        heldParent ??
        (await openRepositoryDirectory(
          policy,
          dirname(path) === "." ? "" : dirname(path),
        ));
      let stat;
      try {
        stat = await lstat(join(parent.descriptorPath, basename(path)), {
          bigint: true,
        });
        await parent.verify();
      } finally {
        if (!heldParent) await parent.close();
      }
      if (stat.isSymbolicLink()) return;
      const fingerprint = [
        stat.dev,
        stat.ino,
        stat.size,
        stat.mtimeNs,
        stat.ctimeNs,
      ].join(":");
      if (stat.isDirectory()) {
        const held = await openRepositoryDirectory(policy, path);
        const assertCheckouts = async () => {
          await assertAncestorCheckouts?.();
          const nestedGit = await lstat(
            join(held.descriptorPath, ".git"),
          ).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return null;
            throw error;
          });
          if (nestedGit)
            throw new RepositoryReadError(
              "FORBIDDEN",
              "Вложенные репозитории недоступны.",
            );
        };
        const guarded: RepositoryDirectory = {
          ...held,
          verify: async () => {
            // Переиспользование descriptor не разрешает поздно появившийся вложенный checkout.
            await assertCheckouts();
            await held.verify();
          },
        };
        try {
          if (include)
            result.entries.push({
              path,
              type: "directory",
              size: null,
              fingerprint,
            });
          if (level < depth) {
            const directory = await opendir(held.descriptorPath);
            for await (const child of directory) {
              if (result.truncated) break;
              await visit(
                `${path}/${child.name}`,
                level + 1,
                true,
                guarded,
                assertCheckouts,
              );
            }
          }
          await guarded.verify();
        } finally {
          await held.close();
        }
      } else if (
        stat.isFile() &&
        stat.nlink === BigInt(1) &&
        stat.size <= REPOSITORY_MAX_FILE_BYTES
      ) {
        result.entries.push({
          path,
          type: "file",
          size: Number(stat.size),
          fingerprint,
        });
      }
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === "ENOENT" ||
        (error instanceof RepositoryReadError &&
          ["FORBIDDEN", "NOT_FOUND"].includes(error.code))
      )
        return;
      throw error;
    }
  }
  if (base) {
    const parent = await openRepositoryDirectory(
      policy,
      dirname(base) === "." ? "" : dirname(base),
    );
    const stat = await lstat(
      join(parent.descriptorPath, basename(base)),
    ).finally(() => parent.close());
    if (stat.isSymbolicLink())
      throw new RepositoryReadError("FORBIDDEN", "Ссылки не разрешены.");
    if (stat.isDirectory()) {
      const held = await openRepositoryDirectory(policy, base);
      await held.close();
    }
    await visit(base, 0, !stat.isDirectory());
  } else {
    for (const path of [
      ...REPOSITORY_ROOT_FILES,
      ...REPOSITORY_ROOT_DIRECTORIES,
    ]) {
      if (result.truncated) break;
      await visit(path, 1);
    }
  }
  result.entries.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  return result;
}
