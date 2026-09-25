/**
 * @file services/ai-control-plane/src/openRepositoryDirectory.adapter.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Закрепляет каталог descriptor-ами без перехода по ссылкам и вложенным checkout.
 * @see documentation/specifications/internal-mcp.md
 */
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { RepositoryReadError } from "./RepositoryRead.error";
import type {
  RepositoryDirectory,
  RepositoryReadPolicy,
} from "./RepositoryRead.types";
import { parseRepositoryPath } from "./repositoryReadPolicy.validator";

/** Linux descriptor paths удерживают родителей даже при конкурентном rename. */
export async function openRepositoryDirectory(
  policy: RepositoryReadPolicy,
  path: string,
): Promise<RepositoryDirectory> {
  parseRepositoryPath(path, true);
  const handles: FileHandle[] = [];
  const close = async () => {
    await Promise.all(handles.map((handle) => handle.close()));
  };
  try {
    let handle = await open(
      policy.root,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    handles.push(handle);
    const root = await handle.stat();
    if (root.dev !== policy.device || root.ino !== policy.inode)
      throw new RepositoryReadError(
        "CONFLICT",
        "Корень рабочей области изменился.",
      );
    for (const segment of path ? path.split("/") : []) {
      handle = await open(
        `/proc/self/fd/${handle.fd}/${segment}`,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      handles.push(handle);
      const nestedGit = await lstat(`/proc/self/fd/${handle.fd}/.git`).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        },
      );
      if (nestedGit)
        throw new RepositoryReadError(
          "FORBIDDEN",
          "Вложенные репозитории недоступны.",
        );
    }
    const descriptorPath = `/proc/self/fd/${handle.fd}`;
    const expectedPath = join(policy.root, path);
    const verify = async () => {
      if (
        (await realpath(descriptorPath)) !== expectedPath ||
        (await realpath(expectedPath)) !== expectedPath
      ) {
        throw new RepositoryReadError(
          "CONFLICT",
          "Каталог изменился во время чтения.",
        );
      }
      const named = await lstat(expectedPath);
      const held = await handle.stat();
      if (named.dev !== held.dev || named.ino !== held.ino)
        throw new RepositoryReadError("CONFLICT", "Каталог заменён.");
    };
    await verify();
    return { descriptorPath, verify, close };
  } catch (error) {
    await close();
    if (error instanceof RepositoryReadError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT")
      throw new RepositoryReadError("NOT_FOUND", "Каталог не найден.");
    if (["ELOOP", "ENOTDIR"].includes(code ?? ""))
      throw new RepositoryReadError(
        "FORBIDDEN",
        "Ссылки и специальные файлы недоступны.",
      );
    throw error;
  }
}
