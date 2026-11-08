/**
 * @file packages/verification-runtime/src/hashVerificationInputs.adapter.ts
 * @version 1.2.0
 * @date 2026-11-05
 * @description Хеширует реальные source bytes и состав каталогов через закреплённые descriptors без symlink.
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { PolicyError } from "@realize/git-runtime";
import { hashVerificationValue } from "./hashVerificationRecipe.util.ts";

/** Ограничения относятся к явным source inputs; installed dependencies имеют отдельный metadata contract. */
export async function readVerificationInputSnapshot(
  root: string,
  inputs: readonly string[],
  excludeInputs: readonly string[] = [],
): Promise<{
  digest: string;
  paths: string[];
  entries: number;
  files: number;
  directories: number;
  bytes: number;
}> {
  let count = 0,
    total = 0,
    files = 0,
    directories = 0;
  const rows: unknown[] = [];
  const paths = new Set<string>();
  const visited = new Set<string>();
  const forbidden = new Set([".git", ".ai-workspace", "node_modules"]);
  const walk = async (
    parent: FileHandle,
    name: string,
    relative: string,
    depth: number,
    rootScan: boolean,
  ): Promise<void> => {
    if (
      (rootScan && forbidden.has(name)) ||
      excludeInputs.some(
        (path) => relative === path || relative.startsWith(`${path}/`),
      )
    )
      return;
    if (visited.has(relative)) return;
    visited.add(relative);
    if (++count > 50000 || depth > 48 || forbidden.has(name))
      throw new PolicyError(
        "verification_input_scope",
        "Inputs выходят за допустимые границы.",
      );
    let file: FileHandle;
    try {
      file = await open(
        `/proc/self/fd/${parent.fd}/${name}`,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        rows.push([relative, "missing"]);
        paths.add(relative);
        return;
      }
      throw new PolicyError(
        "verification_input_unsafe",
        "Input недоступен или содержит symlink.",
      );
    }
    try {
      const before = await file.stat({ bigint: true });
      if (before.isDirectory()) {
        directories++;
        rows.push([relative || ".", "directory"]);
        for (const child of (await readdir(`/proc/self/fd/${file.fd}`)).sort())
          await walk(
            file,
            child,
            relative ? `${relative}/${child}` : child,
            depth + 1,
            rootScan,
          );
      } else if (before.isFile()) {
        files++;
        if (before.size > BigInt(32) * BigInt(1024) * BigInt(1024))
          throw new PolicyError(
            "verification_input_limit",
            "Input превышает допустимый размер.",
          );
        paths.add(relative);
        const hash = createHash("sha256");
        const buffer = Buffer.alloc(65536);
        let offset = 0;
        for (;;) {
          const read = await file.read(buffer, 0, buffer.length, offset);
          if (!read.bytesRead) break;
          offset += read.bytesRead;
          total += read.bytesRead;
          if (total > 256 * 1024 * 1024 || offset > 32 * 1024 * 1024)
            throw new PolicyError(
              "verification_input_limit",
              "Inputs превышают допустимый объём.",
            );
          hash.update(buffer.subarray(0, read.bytesRead));
        }
        rows.push([
          relative,
          "file",
          hash.digest("hex"),
          before.mode.toString(),
        ]);
      } else
        throw new PolicyError(
          "verification_input_unsafe",
          "Input должен быть обычным файлом или каталогом.",
        );
      const after = await file.stat({ bigint: true });
      if (
        before.ino !== after.ino ||
        before.dev !== after.dev ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs
      )
        throw new PolicyError(
          "verification_inputs_changed",
          "Inputs изменились во время чтения.",
        );
    } finally {
      await file.close();
    }
  };
  for (const input of [...new Set(inputs)].sort()) {
    const parts = input.split("/");
    let directory = await open(
      root,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      let missing = false;
      for (const part of parts.slice(0, -1)) {
        if (forbidden.has(part))
          throw new PolicyError(
            "verification_input_scope",
            "Inputs выходят за допустимые границы.",
          );
        let next: FileHandle;
        try {
          next = await open(
            `/proc/self/fd/${directory.fd}/${part}`,
            constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            rows.push([input, "missing"]);
            paths.add(input);
            missing = true;
            break;
          }
          throw new PolicyError(
            "verification_input_unsafe",
            "Input содержит недоступный каталог.",
          );
        }
        await directory.close();
        directory = next;
      }
      if (!missing)
        await walk(
          directory,
          parts.at(-1)!,
          input === "." ? "" : input,
          parts.length,
          input === ".",
        );
    } finally {
      await directory.close();
    }
  }
  return {
    digest: hashVerificationValue(
      rows.sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b), "en"),
      ),
    ),
    paths: [...paths].sort(),
    entries: count,
    files,
    directories,
    bytes: total,
  };
}

export async function hashVerificationInputs(
  root: string,
  inputs: readonly string[],
  excludeInputs: readonly string[] = [],
): Promise<string> {
  return (await readVerificationInputSnapshot(root, inputs, excludeInputs))
    .digest;
}
