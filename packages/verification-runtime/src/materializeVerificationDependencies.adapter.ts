/**
 * @file packages/verification-runtime/src/materializeVerificationDependencies.adapter.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Материализует зависимости и выдаёт непрозрачное подтверждение стабильного источника и созданной копии.
 */
import { constants } from "node:fs";
import { cp, lstat, realpath, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
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
  await rm(target, { force: true, recursive: true });
  try {
    await cp(source, target, {
      errorOnExist: true,
      force: false,
      mode: constants.COPYFILE_FICLONE,
      recursive: true,
      verbatimSymlinks: true,
    });
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
