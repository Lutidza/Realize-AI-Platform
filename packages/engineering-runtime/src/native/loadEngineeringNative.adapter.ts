/**
 * @file packages/engineering-runtime/src/native/loadEngineeringNative.adapter.ts
 * @version 1.1.0
 * @date 2026-10-27
 * @description Загружает private Node-API addon с create/edit primitives по SHA-256 и descriptor.
 * @see documentation/architecture/engineering-operations.md
 */
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import { constants as osConstants } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  resolve,
  sep,
} from "node:path";
import { NativeFilesystemError } from "./NativeFilesystem.error.ts";
import type {
  LoadEngineeringNativeInput,
  NativeFilesystem,
} from "./NativeFilesystem.types.ts";

const MAX_BINARY_BYTES = 16 * 1024 * 1024;
const MAX_LOADED_BINARIES = 4;
// dlopen cache использует имя /proc/self/fd/N: fd удерживается до выхода process, без повторного использования N.
const loaded = new Map<string, { api: NativeFilesystem; descriptor: number }>();
const retainedDescriptors = new Set<number>();

function assertDirectoryChain(path: string) {
  let current = parse(path).root;
  for (const component of path
    .slice(current.length)
    .split(sep)
    .filter(Boolean)) {
    current = join(current, component);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new NativeFilesystemError(
        "CONFLICT",
        "Native path содержит symlink или неподдержанный parent.",
      );
  }
}

/** Не запускает compiler; принимает только проверенный host artifact в каталоге 0700. */
export function loadEngineeringNative(
  input: LoadEngineeringNativeInput,
): NativeFilesystem {
  if (
    process.platform !== "linux" ||
    process.versions.node !== "24.18.0" ||
    Number(process.versions.napi) < 8
  )
    throw new NativeFilesystemError(
      "UNSUPPORTED",
      "Native filesystem требует Linux и закреплённый Node.js 24.18.0.",
    );
  if (
    typeof input.path !== "string" ||
    !isAbsolute(input.path) ||
    input.path.includes("\0") ||
    !/^[a-f0-9]{64}$/.test(input.sha256)
  )
    throw new NativeFilesystemError(
      "UNSUPPORTED",
      "Native binding требует абсолютный path и SHA-256.",
    );
  let parent: number | undefined;
  let binary: number | undefined;
  let retained = false;
  try {
    const path = resolve(input.path);
    const parentPath = dirname(path);
    assertDirectoryChain(parentPath);
    parent = openSync(
      parentPath,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    const parentIdentity = fstatSync(parent, { bigint: true });
    if (
      parentIdentity.uid !== BigInt(process.getuid!()) ||
      (parentIdentity.mode & 0o7777n) !== 0o700n
    )
      throw new NativeFilesystemError(
        "CONFLICT",
        "Native artifact требует private parent владельца процесса.",
      );
    binary = openSync(
      `/proc/self/fd/${parent}/${basename(path)}`,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const before = fstatSync(binary, { bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.uid !== BigInt(process.getuid!()) ||
      (before.mode & 0o7777n) !== 0o600n ||
      before.size <= 0n ||
      before.size > BigInt(MAX_BINARY_BYTES)
    )
      throw new NativeFilesystemError(
        "CONFLICT",
        "Native artifact имеет неподдержанный owner, mode, links или size.",
      );
    const digest = createHash("sha256");
    const buffer = Buffer.alloc(64 * 1024);
    let position = 0;
    while (position < Number(before.size)) {
      const count = readSync(
        binary,
        buffer,
        0,
        Math.min(buffer.length, Number(before.size) - position),
        position,
      );
      if (!count)
        throw new NativeFilesystemError(
          "CONFLICT",
          "Native artifact изменился во время проверки.",
        );
      digest.update(buffer.subarray(0, count));
      position += count;
    }
    const assertUnchanged = () => {
      const after = fstatSync(binary!, { bigint: true });
      const named = lstatSync(path, { bigint: true });
      const namedParent = lstatSync(parentPath, { bigint: true });
      if (
        after.dev !== before.dev ||
        after.ino !== before.ino ||
        after.size !== before.size ||
        after.mtimeNs !== before.mtimeNs ||
        after.ctimeNs !== before.ctimeNs ||
        named.dev !== before.dev ||
        named.ino !== before.ino ||
        namedParent.dev !== parentIdentity.dev ||
        namedParent.ino !== parentIdentity.ino
      )
        throw new NativeFilesystemError(
          "CONFLICT",
          "Native artifact или его private parent изменились.",
        );
    };
    assertUnchanged();
    if (digest.digest("hex") !== input.sha256)
      throw new NativeFilesystemError(
        "CONFLICT",
        "SHA-256 native artifact не совпадает с host binding.",
      );
    const cached = loaded.get(input.sha256);
    if (cached) return cached.api;
    if (retainedDescriptors.size >= MAX_LOADED_BINARIES)
      throw new NativeFilesystemError(
        "UNSUPPORTED",
        "Достигнут предел загруженных native versions процесса.",
      );
    const nativeModule = { exports: {} } as NodeJS.Module;
    // Даже отказ регистрации после dlopen не разрешает повторное использование его cache path.
    retainedDescriptors.add(binary);
    retained = true;
    process.dlopen(
      nativeModule,
      `/proc/self/fd/${binary}`,
      osConstants.dlopen.RTLD_NOW,
    );
    assertUnchanged();
    const api = nativeModule.exports as NativeFilesystem;
    if (
      typeof api.renameNoReplace !== "function" ||
      typeof api.inspectFd !== "function"
    )
      throw new NativeFilesystemError(
        "UNSUPPORTED",
        "Native artifact не предоставляет ожидаемый API.",
      );
    Object.freeze(api);
    loaded.set(input.sha256, { api, descriptor: binary });
    return api;
  } catch (error) {
    if (error instanceof NativeFilesystemError) throw error;
    throw new NativeFilesystemError(
      "UNSUPPORTED",
      "Не удалось проверить или загрузить native artifact.",
    );
  } finally {
    if (binary !== undefined && !retained) closeSync(binary);
    if (parent !== undefined) closeSync(parent);
  }
}
