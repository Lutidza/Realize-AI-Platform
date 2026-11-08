/**
 * @file packages/engineering-runtime/src/storage/openPrivateStorage.adapter.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Открывает private SQLite path с проверкой владельца, режима, inode и отсутствия symlinks.
 * @see documentation/architecture/engineering-operations.md
 */
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  statfsSync,
} from "node:fs";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { StorageError } from "./Storage.error.ts";
import { assertStorageFilesystem } from "./assertStorageFilesystem.policy.ts";

function assertDirectoryChain(path: string): void {
  let current = parse(path).root;
  for (const component of path
    .slice(current.length)
    .split(sep)
    .filter(Boolean)) {
    current = join(current, component);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new StorageError(
        "CONFLICT",
        "Каталог state или checkout содержит symlink либо изменил тип.",
      );
  }
}

function assertPrivate(path: string, directory: boolean): void {
  const stat = lstatSync(path);
  if (
    stat.isSymbolicLink() ||
    (directory ? !stat.isDirectory() : !stat.isFile()) ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o7777) !== (directory ? 0o700 : 0o600) ||
    (!directory && stat.nlink !== 1)
  )
    throw new StorageError(
      "CONFLICT",
      "Private state требует владельца процесса, безопасного типа и режима 0700/0600.",
    );
}

function assertSidecars(directory: string): void {
  for (const suffix of ["-journal", "-wal", "-shm"]) {
    try {
      assertPrivate(join(directory, `journal.sqlite${suffix}`), false);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

/** Descriptor удерживает parent DB; замена пути обнаруживается до следующего обращения. */
export function openPrivateStorage(
  stateDirectory: string,
  checkoutRoot: string,
) {
  if (process.platform !== "linux")
    throw new StorageError(
      "UNSUPPORTED",
      "SQLite workspace store требует Linux local filesystem.",
    );
  if (!isAbsolute(stateDirectory) || !isAbsolute(checkoutRoot))
    throw new StorageError(
      "INVALID_INPUT",
      "Host paths должны быть абсолютными.",
    );
  const directory = resolve(stateDirectory);
  const root = resolve(checkoutRoot);
  assertDirectoryChain(root);
  const canonicalRoot = realpathSync(root);
  assertStorageFilesystem(statfsSync(canonicalRoot).type);
  const distance = relative(canonicalRoot, directory);
  if (
    !distance ||
    (!distance.startsWith(`..${sep}`) &&
      distance !== ".." &&
      !isAbsolute(distance))
  )
    throw new StorageError(
      "INVALID_INPUT",
      "Private state должен располагаться вне checkout.",
    );
  assertDirectoryChain(resolve(directory, ".."));
  assertStorageFilesystem(statfsSync(resolve(directory, "..")).type);
  try {
    mkdirSync(directory, { mode: 0o700 });
    const parent = openSync(
      resolve(directory, ".."),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      fsyncSync(parent);
    } finally {
      closeSync(parent);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  assertDirectoryChain(directory);
  assertPrivate(directory, true);
  const descriptor = openSync(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  let closed = false;
  try {
    // Проверяется и фактический mount открытого каталога: он может отличаться от parent.
    assertStorageFilesystem(statfsSync(`/proc/self/fd/${descriptor}`).type);
    const directoryIdentity = fstatSync(descriptor, { bigint: true });
    const rootIdentity = lstatSync(canonicalRoot, { bigint: true });
    const databasePath = join(directory, "journal.sqlite");
    // SQLite сам открывает sidecars; private parent и preflight запрещают ссылки до open.
    assertSidecars(directory);
    let file: number | undefined;
    try {
      try {
        file = openSync(
          databasePath,
          constants.O_CREAT |
            constants.O_EXCL |
            constants.O_RDWR |
            constants.O_NOFOLLOW,
          0o600,
        );
        fsyncSync(file);
        fsyncSync(descriptor);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        assertPrivate(databasePath, false);
        file = openSync(databasePath, constants.O_RDWR | constants.O_NOFOLLOW);
      }
    } catch (error) {
      if (file !== undefined) closeSync(file);
      throw error;
    }
    const databaseIdentity = (() => {
      try {
        return fstatSync(file, { bigint: true });
      } finally {
        closeSync(file);
      }
    })();
    const assertCurrent = () => {
      if (closed)
        throw new StorageError("CONFLICT", "Private store уже закрыт.");
      assertDirectoryChain(directory);
      assertDirectoryChain(canonicalRoot);
      assertPrivate(directory, true);
      assertPrivate(databasePath, false);
      assertSidecars(directory);
      const currentDirectory = lstatSync(directory, { bigint: true });
      const currentRoot = lstatSync(canonicalRoot, { bigint: true });
      const currentDatabase = lstatSync(databasePath, { bigint: true });
      if (
        currentDirectory.dev !== directoryIdentity.dev ||
        currentDirectory.ino !== directoryIdentity.ino ||
        currentRoot.dev !== rootIdentity.dev ||
        currentRoot.ino !== rootIdentity.ino ||
        currentDatabase.dev !== databaseIdentity.dev ||
        currentDatabase.ino !== databaseIdentity.ino
      )
        throw new StorageError(
          "CONFLICT",
          "Привязка private state или checkout изменилась.",
        );
    };
    assertCurrent();
    return {
      directory,
      canonicalRoot,
      rootIdentity: {
        dev: String(rootIdentity.dev),
        ino: String(rootIdentity.ino),
      },
      // Путь остаётся привязан к открытому parent descriptor после rename каталога.
      databasePath: `/proc/self/fd/${descriptor}/journal.sqlite`,
      assertCurrent,
      close() {
        if (!closed) {
          closed = true;
          closeSync(descriptor);
        }
      },
    };
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}
