/**
 * @file packages/engineering-runtime/src/storage/assertStorageFilesystem.policy.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Ограничивает durable journal поддержанными типами локальных Linux filesystem.
 * @see documentation/architecture/engineering-operations.md
 */
import { StorageError } from "./Storage.error.ts";

// Linux UAPI linux/magic.h: ext2/3/4, XFS, Btrfs, F2FS, overlay.
// Для overlay host дополнительно обеспечивает persistent backing filesystem.
const PERSISTENT_FILESYSTEM_TYPES = new Set([
  0xef53, 0x58465342, 0x9123683e, 0xf2f52010, 0x794c7630,
]);

/** Неизвестный тип, tmpfs и network filesystem не получают durable capability. */
export function assertStorageFilesystem(type: number): void {
  if (!PERSISTENT_FILESYSTEM_TYPES.has(type))
    throw new StorageError(
      "UNSUPPORTED",
      "Private journal требует поддержанный постоянный локальный filesystem.",
    );
}
