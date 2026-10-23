/**
 * @file packages/verification-runtime/src/readVerificationCheckpoint.adapter.ts
 * @version 1.1.1
 * @date 2026-10-23
 * @description Сканирует общие inputs один раз на checkpoint, сохраняя отдельные ключи адресных проверок.
 */
import { fileURLToPath } from "node:url";
import { hashVerificationDependencies } from "./hashVerificationDependencies.adapter.ts";
import { hashVerificationInputs } from "./hashVerificationInputs.adapter.ts";
import {
  hashVerificationValue,
  hashVerificationRecipe,
} from "./hashVerificationRecipe.util.ts";
import { VERIFICATION_AUTOMATIC_INPUTS } from "./verificationInputs.constants.ts";
import { readVerificationEnvironment } from "./readVerificationEnvironment.adapter.ts";
import { readVerificationRuntime } from "./readVerificationRuntime.adapter.ts";
import { readMaterializedVerificationDependencies } from "./materializeVerificationDependencies.adapter.ts";
import { assertVerificationOwner } from "./assertVerificationOwner.adapter.ts";
import type {
  VerificationCheck,
  VerificationCheckpoint,
  VerificationOptions,
} from "./Verification.types.ts";

export async function readVerificationSharedCheckpoint(
  root: string,
  options: VerificationOptions,
): Promise<string> {
  const ownerRoot = fileURLToPath(
    new URL("../../../", import.meta.url),
  ).replace(/\/$/u, "");
  await assertVerificationOwner(ownerRoot);
  const [dependencies, configuration, owner] = await Promise.all([
    options.dependencyLease
      ? readMaterializedVerificationDependencies(root, options.dependencyLease)
      : hashVerificationDependencies(root),
    hashVerificationInputs(root, [
      ...VERIFICATION_AUTOMATIC_INPUTS,
      ...(options.additionalInputs ?? []),
    ]),
    hashVerificationInputs(ownerRoot, [
      "packages/verification-runtime/package.json",
      "packages/verification-runtime/src",
      "packages/git-runtime/src",
      "packages/git-runtime/package.json",
    ]),
  ]);
  return hashVerificationValue({ dependencies, configuration, owner });
}

export async function readVerificationCheckpoint(
  root: string,
  check: VerificationCheck,
  shared: string,
  options: VerificationOptions,
): Promise<VerificationCheckpoint> {
  const environment = readVerificationEnvironment(check);
  const [runtime, inputs] = await Promise.all([
    readVerificationRuntime(root, check, environment.values),
    hashVerificationInputs(root, check.inputs, check.excludeInputs),
  ]);
  return {
    environment,
    runtime,
    digest: hashVerificationValue({
      root: options.portability === "content" ? null : root,
      shared,
      inputs,
      environment: environment.digest,
      runtime: runtime.digest,
      recipe: hashVerificationRecipe(check),
    }),
  };
}
