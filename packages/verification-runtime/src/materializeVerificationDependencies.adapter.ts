/**
 * @file packages/verification-runtime/src/materializeVerificationDependencies.adapter.ts
 * @version 1.0.1
 * @date 2026-11-04
 * @description Материализует зависимости и выдаёт непрозрачное подтверждение стабильного источника и созданной копии.
 */
import { constants } from "node:fs";
import { cp, lstat, readdir, realpath, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { PolicyError } from "@realize/git-runtime";
import type {
  VerificationDependencyLease,
  VerificationDependencyState,
} from "./Verification.types.ts";
import {
  hashVerificationDependencies,
  readVerificationDependencySnapshot,
} from "./hashVerificationDependencies.adapter.ts";
import { hashVerificationValue } from "./hashVerificationRecipe.util.ts";
import { hashVerificationInputs } from "./hashVerificationInputs.adapter.ts";

const leases = new WeakMap<object, VerificationDependencyState>();

async function findMissingWorkspacePackageLinks(
  repositoryRoot: string,
  workspace: string,
  source: string,
): Promise<string[]> {
  const missing: string[] = [];
  let entries = 1;
  const walk = async (directory: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      const path = join(directory, name);
      const relativePath = relative(source, path).split("\\").join("/");
      const depth = relativePath.split("/").length;
      if (++entries > 250000 || depth > 64)
        throw new PolicyError(
          "verification_dependencies_limit",
          "Inventory зависимостей превышает предел.",
        );
      const stat = await lstat(path);
      if (
        stat.isDirectory() &&
        [".cache", ".vite", ".vite-temp"].includes(name)
      )
        continue;
      if (stat.isSymbolicLink()) {
        const target = await realpath(path);
        const local = relative(repositoryRoot, target);
        const packagePath = local.split("\\").join("/").split("/");
        if (
          packagePath.length === 2 &&
          packagePath[0] === "packages" &&
          packagePath[1] !== "" &&
          !packagePath.includes("..")
        ) {
          const targetPackage = join(workspace, local);
          const workspacePackages = join(workspace, "packages");
          const packagesStat = await lstat(workspacePackages).catch((error) => {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
            throw error;
          });
          if (
            !packagesStat ||
            (packagesStat.isDirectory() && !packagesStat.isSymbolicLink())
          ) {
            try {
              await lstat(targetPackage);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                throw error;
              const packageManifest = join(
                repositoryRoot,
                local,
                "package.json",
              );
              const manifestStat = await lstat(packageManifest).catch(
                (manifestError) => {
                  if (
                    (manifestError as NodeJS.ErrnoException).code === "ENOENT"
                  )
                    return;
                  throw manifestError;
                },
              );
              if (manifestStat?.isFile() && !manifestStat.isSymbolicLink())
                missing.push(relative(source, path));
            }
          }
        }
      } else if (stat.isDirectory()) await walk(path);
    }
  };
  await walk(source);
  return missing;
}

/** Только этот owner копирует tree и подтверждает его идентичность; cleanup назначает вызывающий host. */
export async function materializeVerificationDependencies(
  repositoryRoot: string,
  workspace: string,
): Promise<VerificationDependencyLease> {
  if (
    resolve(repositoryRoot) !== repositoryRoot ||
    resolve(workspace) !== workspace ||
    (await realpath(repositoryRoot)) !== repositoryRoot ||
    (await realpath(workspace)) !== workspace ||
    repositoryRoot === workspace
  )
    throw new PolicyError(
      "verification_dependencies_unsafe",
      "Корни materialization должны быть разными каноническими каталогами.",
    );
  const source = join(repositoryRoot, "node_modules");
  const target = join(workspace, "node_modules");
  const sourceStat = await lstat(source);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink())
    throw new PolicyError(
      "verification_dependencies_unsafe",
      "Исходные зависимости должны быть обычным каталогом.",
    );
  const before = await hashVerificationDependencies(repositoryRoot);
  const missingWorkspaceLinks = await findMissingWorkspacePackageLinks(
    repositoryRoot,
    workspace,
    source,
  );
  await rm(target, { force: true, recursive: true });
  try {
    await cp(source, target, {
      errorOnExist: true,
      force: false,
      mode: constants.COPYFILE_FICLONE,
      recursive: true,
      verbatimSymlinks: true,
    });
    for (const path of missingWorkspaceLinks)
      await rm(join(target, path), { force: true, recursive: true });
    const targetStat = await lstat(target);
    if (!targetStat.isDirectory() || targetStat.isSymbolicLink())
      throw new PolicyError(
        "verification_dependencies_unsafe",
        "Созданная копия зависимостей недопустима.",
      );
    const [after, copied] = await Promise.all([
      hashVerificationDependencies(repositoryRoot),
      hashVerificationDependencies(workspace),
    ]);
    if (before !== after)
      throw new PolicyError(
        "verification_dependencies_changed",
        "Исходные зависимости изменились во время копирования.",
      );
    const lease = Object.freeze({}) as VerificationDependencyLease;
    leases.set(lease, {
      workspace,
      source: hashVerificationValue([repositoryRoot, before]),
      copied,
    });
    return lease;
  } catch (error) {
    try {
      await rm(target, { force: true, recursive: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Materialization и cleanup зависимостей завершились ошибкой.",
      );
    }
    throw error;
  }
}

/** Изменение или подмена копии аннулирует capability даже при сохранении исходного lease. */
export async function readMaterializedVerificationDependencies(
  root: string,
  lease: VerificationDependencyLease,
): Promise<string> {
  const state = lease && leases.get(lease);
  if (!state || state.workspace !== root)
    throw new PolicyError(
      "verification_dependency_lease_invalid",
      "Capability зависимостей не принадлежит этому workspace.",
    );
  const current = await readVerificationDependencySnapshot(root);
  if (current.digest !== state.copied)
    throw new PolicyError(
      "verification_dependencies_changed",
      "Материализованные зависимости изменились после подтверждения.",
    );
  // Скопированные workspace symlinks разрешаются в изменённый source tree, а не в исходный host.
  return hashVerificationValue([
    state.source,
    await hashVerificationInputs(root, current.workspaceInputs),
  ]);
}
