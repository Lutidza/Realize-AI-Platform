/**
 * @file services/ai-execution-worker/src/design-workshop/designWorkspaceFilesystem.adapter.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Выполняет ограниченный durable I/O в доверенном private storage worker.
 * @see documentation/specifications/design-workshop.md
 */
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  opendir,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { canonicalizeJSON } from "@realize/change-engine";
import { DesignWorkspaceError } from "./DesignWorkspace.error";
import { DESIGN_WORKSPACE_STORAGE as limits } from "./designWorkspace.constants";

export const isFileError = (error: unknown, code: string): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === code;

export async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isFileError(error, "ENOENT")) return false;
    throw error;
  }
}

const inside = (parent: string, candidate: string): boolean => {
  const value = relative(parent, candidate);
  return (
    value === "" ||
    (!isAbsolute(value) && value !== ".." && !value.startsWith(`..${sep}`))
  );
};

/** Проверяется и существующий ancestor: неверная конфигурация не создаёт каталог в checkout. */
export async function openStorageRoot(
  storageRoot: string,
  repositoryRoot: string,
  create: boolean,
): Promise<string> {
  if (
    ![storageRoot, repositoryRoot].every(
      (value) => isAbsolute(value) && !value.includes("\0"),
    )
  )
    throw new DesignWorkspaceError("INVALID_ROOT");
  const root = resolve(storageRoot);
  const repository = await realpath(repositoryRoot);
  let ancestor = root;
  while (!(await exists(ancestor))) ancestor = dirname(ancestor);
  if (
    (await realpath(ancestor)) !== ancestor ||
    inside(repository, root) ||
    inside(root, repository)
  )
    throw new DesignWorkspaceError("INVALID_ROOT");
  if (create) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    let created = root;
    while (created !== ancestor) {
      await syncDirectory(created);
      created = dirname(created);
    }
    await syncDirectory(ancestor);
  } else if (!(await exists(root))) throw new DesignWorkspaceError("NOT_FOUND");
  await privateDirectory(root);
  return root;
}

/** Root и служебные каталоги доступны только доверенному UID; symlink не принимается. */
export async function privateDirectory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw new DesignWorkspaceError("INTEGRITY");
}

export async function ensureDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 });
    await syncDirectory(dirname(path));
  } catch (error) {
    if (!isFileError(error, "EEXIST")) throw error;
  }
  await privateDirectory(path);
}

export async function syncDirectory(path: string): Promise<void> {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** O_NONBLOCK не позволяет FIFO зависнуть до fstat; размер ограничен даже при росте файла. */
export async function readBoundedFile(
  path: string,
  maximumBytes: number,
  allowReplacedMetadata = false,
): Promise<Buffer> {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      (stat.nlink !== 1 && !(allowReplacedMetadata && stat.nlink === 0)) ||
      stat.size > maximumBytes ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw new DesignWorkspaceError("INTEGRITY");
    const buffer = Buffer.alloc(maximumBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(
        buffer,
        length,
        buffer.length - length,
        length,
      );
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > maximumBytes || length !== stat.size)
      throw new DesignWorkspaceError("INTEGRITY");
    return buffer.subarray(0, length);
  } finally {
    await handle.close();
  }
}

export async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(
      // Atomic journal/receipt replacement может отвязать уже открытый старый inode.
      // Его полный JSON остаётся валиден; hardlink с nlink > 1 по-прежнему запрещён.
      (await readBoundedFile(path, limits.metadataBytes, true)).toString(
        "utf8",
      ),
    );
  } catch (error) {
    if (isFileError(error, "ENOENT")) throw error;
    throw new DesignWorkspaceError("INTEGRITY");
  }
}

export async function writeFileDurably(
  path: string,
  bytes: string,
): Promise<void> {
  const handle = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Atomic metadata replacement применяется только к journal или уже сверенной эквивалентной receipt. */
export async function writeJsonAtomically(
  path: string,
  value: unknown,
): Promise<void> {
  const parent = dirname(path);
  await privateDirectory(parent);
  const temporary = join(parent, `.write-${randomUUID()}`);
  try {
    await writeFileDurably(temporary, canonicalizeJSON(value));
    await rename(temporary, path);
    await syncDirectory(parent);
  } finally {
    try {
      await unlink(temporary);
    } catch (error) {
      if (!isFileError(error, "ENOENT")) throw error;
    }
  }
}

export async function entries(
  path: string,
  maximum: number,
): Promise<string[]> {
  await privateDirectory(path);
  const values: string[] = [];
  const directory = await opendir(path);
  for await (const entry of directory) {
    values.push(entry.name);
    if (values.length > maximum) throw new DesignWorkspaceError("CAPACITY");
  }
  return values.sort();
}
