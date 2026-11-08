/**
 * @file packages/verification-runtime/src/readVerificationCheckpoint.adapter.ts
 * @version 1.2.0
 * @date 2026-11-05
 * @description Сканирует общие inputs один раз на checkpoint, сохраняя отдельные ключи адресных проверок.
 */
import { fileURLToPath } from "node:url";
import { hashVerificationDependencies } from "./hashVerificationDependencies.adapter.ts";
import { readVerificationInputSnapshot } from "./hashVerificationInputs.adapter.ts";
import {
  hashVerificationValue,
  hashVerificationRecipe,
} from "./hashVerificationRecipe.util.ts";
import { VERIFICATION_AUTOMATIC_INPUTS } from "./verificationInputs.constants.ts";
import { readVerificationEnvironment } from "./readVerificationEnvironment.adapter.ts";
import { readVerificationRuntime } from "./readVerificationRuntime.adapter.ts";
import { readMaterializedVerificationDependencies } from "./materializeVerificationDependencies.adapter.ts";
import { assertVerificationOwner } from "./assertVerificationOwner.adapter.ts";
import {
  measureVerificationMeasurement,
  measureVerificationMeasurementSync,
} from "./verificationMeasurement.util.ts";
import type {
  VerificationCheck,
  VerificationCheckpoint,
  VerificationOptions,
} from "./Verification.types.ts";

export async function readVerificationSharedCheckpoint(
  root: string,
  options: VerificationOptions,
): Promise<string> {
  return measureVerificationMeasurement(
    options,
    "shared_checkpoint_total",
    async () => {
      const ownerRoot = fileURLToPath(
        new URL("../../../", import.meta.url),
      ).replace(/\/$/u, "");
      await assertVerificationOwner(ownerRoot);
      const [dependencies, configuration, owner] = await Promise.all([
        measureVerificationMeasurement(
          options,
          "shared_dependency_snapshot",
          () =>
            options.dependencyLease
              ? readMaterializedVerificationDependencies(
                  root,
                  options.dependencyLease,
                )
              : hashVerificationDependencies(root),
        ),
        measureVerificationMeasurement(
          options,
          "shared_configuration_inventory_hash",
          () =>
            readVerificationInputSnapshot(root, [
              ...VERIFICATION_AUTOMATIC_INPUTS,
              ...(options.additionalInputs ?? []),
            ]),
          (snapshot) => ({
            entries: snapshot.entries,
            files: snapshot.files,
            directories: snapshot.directories,
            bytes: snapshot.bytes,
          }),
        ).then((snapshot) => snapshot.digest),
        measureVerificationMeasurement(
          options,
          "runtime_owner_inventory_hash",
          () =>
            readVerificationInputSnapshot(ownerRoot, [
              "packages/verification-runtime/package.json",
              "packages/verification-runtime/src",
              "packages/git-runtime/src",
              "packages/git-runtime/package.json",
            ]),
          (snapshot) => ({
            entries: snapshot.entries,
            files: snapshot.files,
            directories: snapshot.directories,
            bytes: snapshot.bytes,
          }),
        ).then((snapshot) => snapshot.digest),
      ]);
      return hashVerificationValue({ dependencies, configuration, owner });
    },
  );
}

export async function readVerificationCheckpoint(
  root: string,
  check: VerificationCheck,
  shared: string,
  options: VerificationOptions,
): Promise<VerificationCheckpoint> {
  return measureVerificationMeasurement(
    options,
    "check_checkpoint_total",
    async () => {
      const environment = measureVerificationMeasurementSync(
        options,
        "check_environment",
        () => readVerificationEnvironment(check),
      );
      const [runtime, inputs] = await Promise.all([
        measureVerificationMeasurement(
          options,
          "check_runtime_identity_and_npm_metadata",
          () =>
            readVerificationRuntime(root, check, environment.values, options),
        ),
        measureVerificationMeasurement(
          options,
          "check_source_inventory_hash",
          () =>
            readVerificationInputSnapshot(
              root,
              check.inputs,
              check.excludeInputs,
            ),
          (snapshot) => ({
            entries: snapshot.entries,
            files: snapshot.files,
            directories: snapshot.directories,
            bytes: snapshot.bytes,
          }),
        ),
      ]);
      return {
        environment,
        runtime,
        digest: hashVerificationValue({
          root: options.portability === "content" ? null : root,
          shared,
          inputs: inputs.digest,
          environment: environment.digest,
          runtime: runtime.digest,
          recipe: hashVerificationRecipe(check),
        }),
      };
    },
  );
}
