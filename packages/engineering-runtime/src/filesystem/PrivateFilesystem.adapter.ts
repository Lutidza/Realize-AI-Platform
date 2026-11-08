/**
 * @file packages/engineering-runtime/src/filesystem/PrivateFilesystem.adapter.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Управляет приватным staging/content деревом с постоянной identity и общей квотой.
 * @see documentation/architecture/engineering-operations.md
 */
import {
  constants,
  closeSync,
  fsyncSync,
  fstatSync,
  mkdirSync,
  openSync,
  opendirSync,
  statfsSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { failure } from "../runtime/EngineeringFailure.error.ts";
import { assertStorageFilesystem } from "../storage/assertStorageFilesystem.policy.ts";
import {
  assertDescriptorPhysicalPath,
  assertDescriptorUnchanged,
  assertSupportedObject,
  descriptorPath,
  identityFromFd,
  openPhysicalDirectory,
  openReadonlyEntry,
} from "./DescriptorFilesystem.adapter.ts";
import type { NativeFilesystem } from "../native/engineeringNative.index.ts";

const MAX_PRIVATE_BYTES = 128 * 1024 * 1024;
const MAX_PRIVATE_OBJECTS = 4096;
const MAX_PRIVATE_DEPTH = 4;
// Private JSON envelope содержит base64 payload; checkout/staged bytes имеют отдельный предел 8 MiB.
const MAX_PRIVATE_FILE_BYTES = 12 * 1024 * 1024;
const DIRECTORY_BYTES = 4096;
const DIRECTORY_FLAGS =
  constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;

function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return (
    !path ||
    (path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path))
  );
}

/** Только caller под workspace lease может создавать новые retained объекты. GC здесь отсутствует. */
export class PrivateFilesystem {
  readonly fd: number;
  private readonly inode: string;
  private readonly device: string;

  constructor(
    readonly path: string,
    checkoutRoot: string,
    readonly native: NativeFilesystem,
  ) {
    if (!isAbsolute(path) || resolve(path) !== path || path.includes("\0"))
      failure("INVALID_INPUT", "Private path должен быть canonical.");
    if (isWithin(checkoutRoot, path) || isWithin(path, checkoutRoot))
      failure(
        "INVALID_INPUT",
        "Private storage и checkout не должны пересекаться.",
      );
    const checkout = openPhysicalDirectory(checkoutRoot);
    let parent: number | undefined;
    let opened: number | undefined;
    try {
      parent = openPhysicalDirectory(dirname(path));
      assertStorageFilesystem(statfsSync(descriptorPath(parent)).type);
      const checkoutDevice = fstatSync(checkout, { bigint: true }).dev;
      if (fstatSync(parent, { bigint: true }).dev !== checkoutDevice)
        failure("UNSUPPORTED", "Private storage требует filesystem checkout.");
      try {
        mkdirSync(descriptorPath(parent, basename(path)), { mode: 0o700 });
        fsyncSync(parent);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      opened = openSync(
        descriptorPath(parent, basename(path)),
        DIRECTORY_FLAGS,
      );
      const stat = fstatSync(opened, { bigint: true });
      identityFromFd(opened, native, false);
      if ((stat.mode & 0o7777n) !== 0o700n || stat.dev !== checkoutDevice)
        failure(
          "UNSUPPORTED",
          "Private directory требует mode0700 и filesystem checkout.",
        );
      assertDescriptorPhysicalPath(checkout, checkoutRoot);
      assertDescriptorPhysicalPath(opened, path);
      this.fd = opened;
      this.inode = String(stat.ino);
      this.device = String(stat.dev);
      this.assertCurrent();
    } catch (error) {
      if (opened !== undefined) closeSync(opened);
      throw error;
    } finally {
      if (parent !== undefined) closeSync(parent);
      closeSync(checkout);
    }
  }

  assertCurrent(): void {
    let current: number | undefined;
    try {
      current = openPhysicalDirectory(this.path);
      for (const fd of [this.fd, current]) {
        const identity = identityFromFd(fd, this.native, false);
        if (
          identity.ino !== this.inode ||
          identity.dev !== this.device ||
          identity.mode !== 0o700
        )
          failure("CONFLICT", "Private directory binding изменился.");
      }
      assertDescriptorPhysicalPath(this.fd, this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        failure("CONFLICT", "Private directory отсутствует.");
      throw error;
    } finally {
      if (current !== undefined) closeSync(current);
    }
  }

  /** Создаёт только private контейнер 0700; caller закрывает возвращённый descriptor. */
  ensureDirectory(name: string): number {
    if (!/^[a-z0-9-]+$/.test(name) || Buffer.byteLength(name) > 255)
      failure("INVALID_INPUT", "Недопустимое private имя.");
    this.assertCurrent();
    let fd: number;
    try {
      fd = openSync(descriptorPath(this.fd, name), DIRECTORY_FLAGS);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.assertCapacity(DIRECTORY_BYTES, 1);
      try {
        mkdirSync(descriptorPath(this.fd, name), { mode: 0o700 });
        fsyncSync(this.fd);
      } catch (creationError) {
        if ((creationError as NodeJS.ErrnoException).code !== "EEXIST")
          throw creationError;
      }
      fd = openSync(descriptorPath(this.fd, name), DIRECTORY_FLAGS);
    }
    try {
      const identity = identityFromFd(fd, this.native, false);
      if (identity.mode !== 0o700 || identity.dev !== this.device)
        failure("UNSUPPORTED", "Небезопасный private каталог.");
      this.assertCurrent();
      assertDescriptorPhysicalPath(fd, join(this.path, name));
      return fd;
    } catch (error) {
      closeSync(fd);
      throw error;
    }
  }

  /** Lease защищает резерв mediated writes; retained/temp файлы входят в общую квоту без GC. */
  assertCapacity(
    additionalBytes: number,
    additionalObjects = additionalBytes > 0 ? 1 : 0,
  ): void {
    if (
      !Number.isSafeInteger(additionalBytes) ||
      additionalBytes < 0 ||
      !Number.isSafeInteger(additionalObjects) ||
      additionalObjects < 0
    )
      failure(
        "INVALID_INPUT",
        "Резерв private storage должен быть неотрицательным целым.",
      );
    this.assertCurrent();
    let count = additionalObjects;
    let total = additionalBytes;
    const checkQuota = () => {
      if (count > MAX_PRIVATE_OBJECTS)
        failure("LIMIT_EXCEEDED", "Private inventory переполнен.");
      if (total > MAX_PRIVATE_BYTES)
        failure("LIMIT_EXCEEDED", "Private storage исчерпал квоту 128 MiB.");
    };
    const scan = (fd: number, path: string, depth: number): void => {
      const before = fstatSync(fd, { bigint: true });
      const directory = opendirSync(descriptorPath(fd));
      try {
        for (
          let entry = directory.readSync();
          entry;
          entry = directory.readSync()
        ) {
          if (depth + 1 > MAX_PRIVATE_DEPTH)
            failure("LIMIT_EXCEEDED", "Private inventory превышает глубину.");
          count += 1;
          checkQuota();
          const child = openReadonlyEntry(fd, entry.name);
          try {
            const stat = fstatSync(child, { bigint: true });
            assertSupportedObject(stat);
            if (String(stat.dev) !== this.device)
              failure(
                "UNSUPPORTED",
                "Private inventory пересекает filesystem.",
              );
            this.native.inspectFd(child);
            if (stat.isFile() && stat.size > BigInt(MAX_PRIVATE_FILE_BYTES))
              failure(
                "LIMIT_EXCEEDED",
                "Private файл превышает лимит envelope.",
              );
            total += stat.isFile() ? Number(stat.size) : DIRECTORY_BYTES;
            checkQuota();
            const childPath = join(path, entry.name);
            if (stat.isDirectory()) scan(child, childPath, depth + 1);
            this.native.inspectFd(child);
            assertDescriptorUnchanged(child, stat);
            assertDescriptorPhysicalPath(child, childPath);
          } finally {
            closeSync(child);
          }
        }
      } finally {
        directory.closeSync();
      }
      assertDescriptorUnchanged(fd, before);
      assertDescriptorPhysicalPath(fd, path);
    };
    checkQuota();
    scan(this.fd, this.path, 0);
    this.assertCurrent();
  }

  close(): void {
    closeSync(this.fd);
  }
}
