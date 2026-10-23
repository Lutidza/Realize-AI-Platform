/**
 * @file packages/verification-runtime/src/hashVerificationDependencies.adapter.ts
 * @version 1.1.0
 * @date 2026-10-22
 * @description Сверяет installed dependencies по bounded metadata inventory, сохраняя hidden lock и workspace symlinks.
 */
import { lstat, open, readdir, readlink, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, isAbsolute } from "node:path";
import { PolicyError } from "@realize/git-runtime";
import { hashVerificationValue } from "./hashVerificationRecipe.util.ts";

/** Cooperative FS contract: ctime/inode/mtime обнаруживают изменения без повторного чтения гигабайтов модулей. */
export async function readVerificationDependencySnapshot(
  root: string,
): Promise<{ digest: string; workspaceInputs: string[] }> {
  const rows: unknown[] = [],
    visited = new Set<string>();
  const workspaceInputs = new Set<string>();
  let entries = 0;
  const walk = async (
    path: string,
    name: string,
    depth: number,
  ): Promise<void> => {
    if (++entries > 250000 || depth > 64)
      throw new PolicyError(
        "verification_dependencies_limit",
        "Inventory зависимостей превышает предел.",
      );
    const stat = await lstat(path, { bigint: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (!stat) {
      rows.push([name, "missing"]);
      return;
    }
    // Только generated caches installed tree; source inputs никогда не исключаются по basename.
    if (
      stat.isDirectory() &&
      [".cache", ".vite", ".vite-temp"].includes(name.split("/").at(-1)!)
    )
      return;
    // Состав directory уже представлен children; cache creation не меняет dependency identity родителя.
    rows.push(
      stat.isDirectory()
        ? [
            name,
            "directory",
            stat.dev.toString(),
            stat.ino.toString(),
            stat.mode.toString(),
          ]
        : [
            name,
            stat.dev.toString(),
            stat.ino.toString(),
            stat.ctimeNs.toString(),
            stat.mtimeNs.toString(),
            stat.size.toString(),
            stat.mode.toString(),
          ],
    );
    if (name === "node_modules/.package-lock.json" && stat.isFile()) {
      if (stat.size > BigInt(32) * BigInt(1024) * BigInt(1024))
        throw new PolicyError(
          "verification_dependencies_limit",
          "Installed lock превышает предел.",
        );
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const bytes = await file.readFile();
        if (bytes.length > 32 * 1024 * 1024)
          throw new PolicyError(
            "verification_dependencies_limit",
            "Installed lock превышает предел.",
          );
        rows.push([
          name,
          "sha256",
          createHash("sha256").update(bytes).digest("hex"),
        ]);
        const after = await file.stat({ bigint: true });
        if (
          after.ino !== stat.ino ||
          after.dev !== stat.dev ||
          after.ctimeNs !== stat.ctimeNs ||
          after.size !== stat.size
        )
          throw new PolicyError(
            "verification_dependencies_changed",
            "Installed lock изменился во время чтения.",
          );
      } finally {
        await file.close();
      }
    }
    if (stat.isSymbolicLink()) {
      const target = await realpath(path).catch(() => {
        throw new PolicyError(
          "verification_dependencies_unsafe",
          "Dependency symlink недоступен.",
        );
      });
      const local = relative(root, target);
      if (
        !local ||
        local === ".." ||
        local.startsWith("../") ||
        isAbsolute(local) ||
        local
          .split("/")
          .some((part) => [".git", ".ai-workspace"].includes(part))
      )
        throw new PolicyError(
          "verification_dependencies_unsafe",
          "Dependency symlink выходит за workspace.",
        );
      rows.push([name, "symlink", await readlink(path), local]);
      if (local !== "node_modules" && !local.startsWith("node_modules/"))
        workspaceInputs.add(local);
      if (!visited.has(target)) {
        visited.add(target);
        await walk(target, `workspace:${local}`, depth + 1);
      }
    } else if (stat.isDirectory()) {
      for (const child of (await readdir(path)).sort())
        await walk(join(path, child), `${name}/${child}`, depth + 1);
      const after = await lstat(path, { bigint: true });
      if (
        stat.ino !== after.ino ||
        stat.dev !== after.dev ||
        stat.mtimeNs !== after.mtimeNs ||
        stat.ctimeNs !== after.ctimeNs
      )
        throw new PolicyError(
          "verification_dependencies_changed",
          "Dependencies изменились во время inventory.",
        );
    } else if (!stat.isFile())
      throw new PolicyError(
        "verification_dependencies_unsafe",
        "Недопустимый installed dependency entry.",
      );
  };
  await walk(join(root, "node_modules"), "node_modules", 0);
  return {
    digest: hashVerificationValue(rows),
    workspaceInputs: [...workspaceInputs].sort(),
  };
}

/** Metadata inventory привязывает installed tree без повторного чтения гигабайтов модулей. */
export async function hashVerificationDependencies(
  root: string,
): Promise<string> {
  return (await readVerificationDependencySnapshot(root)).digest;
}
