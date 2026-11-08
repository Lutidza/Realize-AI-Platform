/**
 * @file packages/engineering-runtime/src/filesystem/DescriptorFilesystem.adapter.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Читает ограниченные файлы и пространства имён через no-follow directory descriptors.
 * @see documentation/architecture/engineering-operations.md
 */
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  opendirSync,
  readlinkSync,
  readSync,
  statfsSync,
  type BigIntStats,
} from "node:fs";
import { isAbsolute, join, parse, resolve, sep } from "node:path";
import { engineeringPathSchema } from "../contracts/engineeringPrimitives.schemas.ts";
import { sha256Bytes } from "../contracts/hashEngineeringValue.util.ts";
import { failure } from "../runtime/EngineeringFailure.error.ts";
import { assertStorageFilesystem } from "../storage/assertStorageFilesystem.policy.ts";
import type { NativeFilesystem } from "../native/engineeringNative.index.ts";
import type {
  FilesystemIdentity,
  ManifestEntry,
} from "./EngineeringFilesystem.types.ts";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_NAMESPACE_ENTRIES = 4096;
// Linux O_PATH закрепляет inode без открытия device/FIFO; Node не экспортирует этот flag.
const O_PATH = 0x200000;
const DIRECTORY_FLAGS =
  constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;

export function descriptorPath(fd: number, name?: string) {
  return `/proc/self/fd/${fd}${name === undefined ? "" : "/" + name}`;
}

export function validateRelative(path: string) {
  if (!engineeringPathSchema.safeParse(path).success)
    failure("INVALID_INPUT", "Недопустимый относительный путь.");
}

export function assertSupportedObject(stat: BigIntStats) {
  if (
    typeof process.getuid !== "function" ||
    (!stat.isDirectory() && !stat.isFile()) ||
    (stat.isFile() && stat.nlink !== 1n) ||
    (stat.mode & 0o7000n) !== 0n ||
    stat.uid !== BigInt(process.getuid())
  )
    failure(
      "UNSUPPORTED",
      "Тип, ссылки, владелец или mode объекта не поддержаны.",
    );
}

/** atime не сравнивается: собственное чтение может законно обновить его. */
export function assertDescriptorUnchanged(
  fd: number,
  before: BigIntStats,
): void {
  const after = fstatSync(fd, { bigint: true });
  if (
    after.dev !== before.dev ||
    after.ino !== before.ino ||
    after.mode !== before.mode ||
    after.uid !== before.uid ||
    after.gid !== before.gid ||
    after.nlink !== before.nlink ||
    after.size !== before.size ||
    after.mtimeNs !== before.mtimeNs ||
    after.ctimeNs !== before.ctimeNs
  )
    failure("CONFLICT", "Объект изменился во время проверки.");
}

/** Закреплённый inode не должен оказаться под другим physical path после rename родителя. */
export function assertDescriptorPhysicalPath(fd: number, path: string): void {
  if (readlinkSync(descriptorPath(fd)) !== path)
    failure("CONFLICT", "Physical path закреплённого объекта изменился.");
}

/** Caller закрывает fd; каждый physical parent открывается относительно предыдущего без symlink. */
export function openPhysicalDirectory(path: string): number {
  if (process.platform !== "linux" || typeof process.getuid !== "function")
    failure("UNSUPPORTED", "Filesystem adapter требует Linux.");
  if (!isAbsolute(path) || resolve(path) !== path || path.includes("\0"))
    failure("INVALID_INPUT", "Root должен быть canonical absolute path.");
  const root = parse(path).root;
  let fd = openSync(root, DIRECTORY_FLAGS);
  try {
    for (const part of path.slice(root.length).split(sep).filter(Boolean)) {
      const next = openSync(descriptorPath(fd, part), DIRECTORY_FLAGS);
      closeSync(fd);
      fd = next;
    }
    assertDescriptorPhysicalPath(fd, path);
    return fd;
  } catch (error) {
    closeSync(fd);
    if (
      ["ENOTDIR", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "")
    )
      failure(
        "UNSUPPORTED",
        "Physical parent не является допустимым каталогом.",
      );
    throw error;
  }
}

/** O_PATH сначала проверяет тип, затем /proc открывает тот же inode без повторного поиска имени. */
export function openReadonlyEntry(parentFd: number, name: string): number {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\0")
  )
    failure("INVALID_INPUT", "Ожидалось одно имя объекта.");
  const pinned = openSync(
    descriptorPath(parentFd, name),
    O_PATH | constants.O_NOFOLLOW,
  );
  let fd: number | undefined;
  try {
    const before = fstatSync(pinned, { bigint: true });
    assertSupportedObject(before);
    fd = openSync(
      descriptorPath(pinned),
      constants.O_RDONLY |
        constants.O_NONBLOCK |
        (before.isDirectory() ? constants.O_DIRECTORY : 0),
    );
    assertDescriptorUnchanged(fd, before);
    return fd;
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    throw error;
  } finally {
    closeSync(pinned);
  }
}

/** Ограничивает фактическое чтение и отклоняет изменение размера/metadata в ходе чтения. */
export function boundedFileBytes(fd: number): Buffer {
  const before = fstatSync(fd, { bigint: true });
  assertSupportedObject(before);
  if (!before.isFile()) failure("UNSUPPORTED", "Ожидался обычный файл.");
  if (before.size > BigInt(MAX_FILE_BYTES))
    failure("LIMIT_EXCEEDED", "Файл превышает лимит чтения.");
  const buffer = Buffer.alloc(Number(before.size) + 1);
  let size = 0;
  while (size < buffer.length) {
    const count = readSync(fd, buffer, size, buffer.length - size, size);
    if (!count) break;
    size += count;
  }
  assertDescriptorUnchanged(fd, before);
  if (size !== Number(before.size))
    failure("CONFLICT", "Файл изменился во время чтения.");
  return buffer.subarray(0, size);
}

export function identityFromFd(
  fd: number,
  native: NativeFilesystem,
  hash = true,
): FilesystemIdentity {
  const stat = fstatSync(fd, { bigint: true });
  assertSupportedObject(stat);
  native.inspectFd(fd);
  if (stat.isFile() && stat.size > BigInt(MAX_FILE_BYTES))
    failure("LIMIT_EXCEEDED", "Файл превышает лимит чтения.");
  const sha256 =
    stat.isFile() && hash ? sha256Bytes(boundedFileBytes(fd)) : null;
  if (stat.isFile() && hash) native.inspectFd(fd);
  assertDescriptorUnchanged(fd, stat);
  return {
    kind: stat.isDirectory() ? "directory" : "file",
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: Number(stat.mode) & 0o777,
    size: stat.isFile() ? Number(stat.size) : null,
    sha256,
  };
}

/** Открытый root сохраняет identity; каждый walk заново проверяет его и все physical parents. */
export class DescriptorFilesystem {
  readonly rootFd: number;
  readonly rootIdentity: FilesystemIdentity;

  constructor(
    readonly root: string,
    readonly native: NativeFilesystem,
  ) {
    this.rootFd = openPhysicalDirectory(root);
    try {
      assertStorageFilesystem(statfsSync(descriptorPath(this.rootFd)).type);
      this.rootIdentity = identityFromFd(this.rootFd, native);
      this.assertRoot();
    } catch (error) {
      closeSync(this.rootFd);
      throw error;
    }
  }

  assertRoot(): void {
    let current: number | undefined;
    try {
      current = openPhysicalDirectory(this.root);
      const named = identityFromFd(current, this.native, false);
      const held = identityFromFd(this.rootFd, this.native, false);
      if (
        named.dev !== this.rootIdentity.dev ||
        named.ino !== this.rootIdentity.ino ||
        held.dev !== named.dev ||
        held.ino !== named.ino
      )
        failure("CONFLICT", "Workspace root изменился.");
      assertDescriptorPhysicalPath(this.rootFd, this.root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        failure("CONFLICT", "Workspace root отсутствует.");
      throw error;
    } finally {
      if (current !== undefined) closeSync(current);
    }
  }

  /** Caller закрывает fd; /proc используется только для уже проверенных process descriptors. */
  openDirectory(path: string): number {
    this.assertRoot();
    if (path) validateRelative(path);
    let fd = openSync(
      descriptorPath(this.rootFd),
      constants.O_RDONLY | constants.O_DIRECTORY,
    );
    try {
      for (const part of path ? path.split("/") : []) {
        const next = openSync(descriptorPath(fd, part), DIRECTORY_FLAGS);
        closeSync(fd);
        fd = next;
        const identity = identityFromFd(fd, this.native, false);
        if (identity.dev !== this.rootIdentity.dev)
          failure("UNSUPPORTED", "Переход между filesystem не поддержан.");
      }
      this.assertRoot();
      assertDescriptorPhysicalPath(fd, join(this.root, path));
      return fd;
    } catch (error) {
      closeSync(fd);
      if (
        ["ENOTDIR", "ELOOP"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        failure("UNSUPPORTED", "Родитель не является допустимым каталогом.");
      throw error;
    }
  }

  entry(path: string): ManifestEntry {
    this.assertRoot();
    if (path) validateRelative(path);
    let parent: number | undefined;
    let object: number | undefined;
    try {
      if (!path) object = this.openDirectory("");
      else {
        const parts = path.split("/");
        const name = parts.pop()!;
        parent = this.openDirectory(parts.join("/"));
        object = openReadonlyEntry(parent, name);
      }
      const before = fstatSync(object, { bigint: true });
      const identity = identityFromFd(object, this.native);
      if (identity.dev !== this.rootIdentity.dev)
        failure("UNSUPPORTED", "Переход между filesystem не поддержан.");
      let children: ManifestEntry["children"] = null;
      if (identity.kind === "directory") {
        children = [];
        const directory = opendirSync(descriptorPath(object));
        try {
          for (
            let entry = directory.readSync();
            entry;
            entry = directory.readSync()
          ) {
            if (children.length >= MAX_NAMESPACE_ENTRIES)
              failure("LIMIT_EXCEEDED", "Namespace превышает лимит entries.");
            const childFd = openReadonlyEntry(object, entry.name);
            try {
              const child = identityFromFd(childFd, this.native, false);
              if (child.dev !== this.rootIdentity.dev)
                failure(
                  "UNSUPPORTED",
                  "Переход между filesystem не поддержан.",
                );
              children.push({
                name: entry.name,
                kind: child.kind,
                dev: child.dev,
                ino: child.ino,
              });
            } finally {
              closeSync(childFd);
            }
          }
        } finally {
          directory.closeSync();
        }
        children.sort((a, b) =>
          a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
        );
      }
      this.native.inspectFd(object);
      assertDescriptorUnchanged(object, before);
      this.assertRoot();
      assertDescriptorPhysicalPath(object, join(this.root, path));
      return { path, identity, children };
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === "ENOENT" &&
        object === undefined
      ) {
        this.assertRoot();
        return { path, identity: null, children: null };
      }
      throw error;
    } finally {
      if (object !== undefined) closeSync(object);
      if (parent !== undefined) closeSync(parent);
    }
  }

  read(path: string): Uint8Array {
    validateRelative(path);
    const parts = path.split("/");
    const name = parts.pop()!;
    const parent = this.openDirectory(parts.join("/"));
    let fd: number | undefined;
    try {
      fd = openReadonlyEntry(parent, name);
      const before = fstatSync(fd, { bigint: true });
      const identity = identityFromFd(fd, this.native, false);
      if (identity.kind !== "file")
        failure("UNSUPPORTED", "Ожидался обычный файл.");
      if (identity.dev !== this.rootIdentity.dev)
        failure("UNSUPPORTED", "Переход между filesystem не поддержан.");
      const bytes = boundedFileBytes(fd);
      this.native.inspectFd(fd);
      assertDescriptorUnchanged(fd, before);
      this.assertRoot();
      assertDescriptorPhysicalPath(fd, join(this.root, path));
      return bytes;
    } finally {
      if (fd !== undefined) closeSync(fd);
      closeSync(parent);
    }
  }

  close(): void {
    closeSync(this.rootFd);
  }
}
