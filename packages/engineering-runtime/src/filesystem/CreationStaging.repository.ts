/**
 * @file packages/engineering-runtime/src/filesystem/CreationStaging.repository.ts
 * @version 1.3.1
 * @date 2026-10-29
 * @description Готовит staging, выполняет exact-identity move и помещает remove в quarantine.
 * @see documentation/architecture/engineering-operations.md
 */
import {
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { hashEngineeringValue } from "../contracts/hashEngineeringValue.util.ts";
import type { PrivateFilesystem } from "./PrivateFilesystem.adapter.ts";
import {
  DescriptorFilesystem,
  descriptorPath,
  identityFromFd,
  openReadonlyEntry,
} from "./DescriptorFilesystem.adapter.ts";
import { failure } from "../runtime/EngineeringFailure.error.ts";
import type {
  CreationManifest,
  CreationStep,
  FilesystemIdentity,
  FilesystemMutationInput,
} from "./EngineeringFilesystem.types.ts";
import { baseName, parentPath } from "./creationManifest.service.ts";
import { syncFilesystemTree } from "./syncFilesystemTree.adapter.ts";
import { selectManifestTree } from "./selectManifestTree.util.ts";

function syncExpectedEntry(
  parentFd: number,
  name: string,
  expected: FilesystemIdentity,
  native: PrivateFilesystem["native"],
) {
  const object = openReadonlyEntry(parentFd, name);
  try {
    const actual = identityFromFd(object, native);
    if (hashEngineeringValue(actual) !== hashEngineeringValue(expected))
      failure("CONFLICT", "Identity объекта изменилась до fsync.");
    fsyncSync(object);
  } finally {
    closeSync(object);
  }
}

export class CreationStaging {
  constructor(
    private readonly storage: PrivateFilesystem,
    private readonly checkout: DescriptorFilesystem,
  ) {}
  create(inputs: FilesystemMutationInput[]) {
    this.storage.assertCapacity(
      inputs.reduce(
        (n, value) =>
          n +
          (value.bytes?.length ?? 0) +
          (value.kind === "edit_file" || value.kind === "remove"
            ? (value.sourceIdentity?.size ?? 0)
            : 0) +
          (value.kind === "move" ? 0 : 4096),
        4096,
      ),
      inputs.filter((value) => value.kind !== "move").length + 1,
    );
    const stagingId = randomUUID(),
      fd = this.storage.ensureDirectory(stagingId);
    try {
      const stagingIdentity = identityFromFd(fd, this.storage.native);
      if (stagingIdentity.dev !== this.checkout.rootIdentity.dev)
        failure(
          "UNSUPPORTED",
          "Staging и checkout должны быть на одном filesystem.",
        );
      const steps: CreationStep[] = inputs.map((input) => {
        const stagedName = input.kind === "move" ? null : String(input.index);
        if (input.kind === "move") {
          if (!input.fromPath || !input.sourceIdentity)
            failure("INVALID_INPUT", "Move требует исходный path и identity.");
          return {
            path: input.path,
            kind: input.kind,
            fromPath: input.fromPath,
            stagedName,
            identity: input.sourceIdentity,
            sourceIdentity: input.sourceIdentity,
            contentSha256: input.sourceIdentity.sha256,
          };
        }
        if (input.kind === "remove") {
          if (!input.sourceIdentity)
            failure("INVALID_INPUT", "Quarantine требует исходную identity.");
          return {
            path: input.path,
            kind: input.kind,
            fromPath: null,
            stagedName,
            identity: null,
            sourceIdentity: input.sourceIdentity,
            contentSha256: null,
          };
        }
        let object: number;
        if (input.kind === "create_directory") {
          mkdirSync(descriptorPath(fd, stagedName!), { mode: 0o755 });
          object = openSync(
            descriptorPath(fd, stagedName!),
            constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
          );
        } else
          object = openSync(
            descriptorPath(fd, stagedName!),
            constants.O_RDWR |
              constants.O_CREAT |
              constants.O_EXCL |
              constants.O_NOFOLLOW,
            0o644,
          );
        try {
          fchmodSync(
            object,
            input.mode ?? (input.kind === "create_directory" ? 0o755 : 0o644),
          );
          if (input.bytes) writeFileSync(object, input.bytes);
          fsyncSync(object);
          const identity = identityFromFd(object, this.storage.native);
          return {
            path: input.path,
            kind: input.kind,
            fromPath: null,
            stagedName,
            identity,
            sourceIdentity: input.sourceIdentity ?? null,
            contentSha256: identity.sha256,
          };
        } finally {
          closeSync(object);
        }
      });
      fsyncSync(fd);
      return { stagingId, stagingIdentity, steps };
    } finally {
      closeSync(fd);
    }
  }
  open(manifest: CreationManifest) {
    this.storage.assertCurrent();
    const stage = new DescriptorFilesystem(
      join(this.storage.path, manifest.stagingId),
      this.storage.native,
    );
    if (
      stage.rootIdentity.dev !== manifest.stagingIdentity.dev ||
      stage.rootIdentity.ino !== manifest.stagingIdentity.ino
    ) {
      stage.close();
      failure("CONFLICT", "Staging identity изменилась.");
    }
    return stage;
  }
  publish(manifest: CreationManifest, index: number) {
    const step = manifest.steps[index];
    if (!step) failure("INVALID_INPUT", "Неизвестный effect index.");
    const tree =
      step.kind === "move" && step.sourceIdentity?.kind === "directory"
        ? selectManifestTree(manifest.before, step.fromPath!)
        : null;
    if (tree)
      syncFilesystemTree(this.checkout, tree, step.fromPath!, step.fromPath!);
    const stage = this.open(manifest);
    let sourceParent: number | undefined, targetParent: number | undefined;
    let preservedSource: number | undefined;
    try {
      if (step.kind === "move") {
        if (!step.fromPath || !step.sourceIdentity)
          failure("CONFLICT", "Move manifest не содержит source identity.");
        sourceParent = this.checkout.openDirectory(parentPath(step.fromPath));
        targetParent = this.checkout.openDirectory(parentPath(step.path));
      } else if (step.kind === "remove") {
        if (!step.sourceIdentity || step.stagedName === null)
          failure("CONFLICT", "Quarantine manifest не содержит identity/slot.");
        sourceParent = this.checkout.openDirectory(parentPath(step.path));
        targetParent = stage.rootFd;
      } else {
        if (step.stagedName === null || !step.identity)
          failure("CONFLICT", "Staged publication не содержит identity/slot.");
        sourceParent = stage.rootFd;
        targetParent = this.checkout.openDirectory(parentPath(step.path));
      }
      if (sourceParent === undefined || targetParent === undefined)
        failure("INTERNAL_ERROR", "Не удалось открыть namespace для mutation.");
      if (step.sourceIdentity) {
        const existingParent =
          step.kind === "move" || step.kind === "remove"
            ? sourceParent
            : targetParent;
        const existingName =
          step.kind === "move" ? baseName(step.fromPath!) : baseName(step.path);
        preservedSource = openReadonlyEntry(existingParent, existingName);
        const actual = identityFromFd(preservedSource, this.storage.native);
        if (
          hashEngineeringValue(actual) !==
          hashEngineeringValue(step.sourceIdentity)
        )
          failure("CONFLICT", "Исходная identity изменилась до mutation.");
        fsyncSync(preservedSource);
      }
      if (step.kind === "move") {
        this.storage.native.renameNoReplace(
          sourceParent,
          baseName(step.fromPath!),
          targetParent,
          baseName(step.path),
          step.sourceIdentity!.dev,
          step.sourceIdentity!.ino,
        );
      } else if (step.kind === "remove") {
        this.storage.native.renameNoReplace(
          sourceParent,
          baseName(step.path),
          targetParent,
          step.stagedName!,
          step.sourceIdentity!.dev,
          step.sourceIdentity!.ino,
        );
      } else if (step.kind === "edit_file") {
        if (typeof this.storage.native.renameExchange !== "function")
          failure(
            "UNSUPPORTED",
            "Native binding не предоставляет atomic edit.",
          );
        this.storage.native.renameExchange(
          sourceParent,
          step.stagedName!,
          targetParent,
          baseName(step.path),
          step.identity!.dev,
          step.identity!.ino,
          step.sourceIdentity!.dev,
          step.sourceIdentity!.ino,
        );
      } else
        this.storage.native.renameNoReplace(
          sourceParent,
          step.stagedName!,
          targetParent,
          baseName(step.path),
          step.identity!.dev,
          step.identity!.ino,
        );
      if (step.kind === "remove")
        syncExpectedEntry(
          stage.rootFd,
          step.stagedName!,
          step.sourceIdentity!,
          this.storage.native,
        );
      else
        syncExpectedEntry(
          targetParent,
          baseName(step.path),
          step.identity!,
          this.storage.native,
        );
      if (step.kind === "edit_file")
        syncExpectedEntry(
          stage.rootFd,
          step.stagedName!,
          step.sourceIdentity!,
          this.storage.native,
        );
      if (tree)
        syncFilesystemTree(this.checkout, tree, step.fromPath!, step.path);
      // Сначала fsync объектов, затем обеих директорий до journal confirmation.
      fsyncSync(sourceParent);
      if (targetParent !== sourceParent) fsyncSync(targetParent);
      fsyncSync(stage.rootFd);
    } finally {
      if (preservedSource !== undefined) closeSync(preservedSource);
      if (targetParent !== undefined && targetParent !== stage.rootFd)
        closeSync(targetParent);
      if (sourceParent !== undefined && sourceParent !== stage.rootFd)
        closeSync(sourceParent);
      stage.close();
    }
  }
  confirmDurable(manifest: CreationManifest, index: number) {
    const step = manifest.steps[index];
    if (!step) failure("INVALID_INPUT", "Неизвестный effect index.");
    if (step.kind === "move" && step.sourceIdentity?.kind === "directory")
      syncFilesystemTree(
        this.checkout,
        selectManifestTree(manifest.before, step.fromPath!),
        step.fromPath!,
        step.path,
      );
    const stage = this.open(manifest);
    let sourceParent: number | undefined, targetParent: number | undefined;
    try {
      if (step.kind === "move") {
        if (!step.fromPath)
          failure("CONFLICT", "Move manifest не содержит исходный path.");
        sourceParent = this.checkout.openDirectory(parentPath(step.fromPath));
        targetParent = this.checkout.openDirectory(parentPath(step.path));
      } else if (step.kind === "remove") {
        sourceParent = this.checkout.openDirectory(parentPath(step.path));
        targetParent = stage.rootFd;
      } else {
        sourceParent = stage.rootFd;
        targetParent = this.checkout.openDirectory(parentPath(step.path));
      }
      if (sourceParent === undefined || targetParent === undefined)
        failure(
          "INTERNAL_ERROR",
          "Не удалось открыть namespace для durability check.",
        );
      if (step.kind === "move")
        syncExpectedEntry(
          targetParent,
          baseName(step.path),
          step.identity!,
          this.storage.native,
        );
      else if (step.kind === "remove")
        syncExpectedEntry(
          stage.rootFd,
          step.stagedName!,
          step.sourceIdentity!,
          this.storage.native,
        );
      else {
        syncExpectedEntry(
          targetParent,
          baseName(step.path),
          step.identity!,
          this.storage.native,
        );
        if (step.kind === "edit_file")
          syncExpectedEntry(
            stage.rootFd,
            step.stagedName!,
            step.sourceIdentity!,
            this.storage.native,
          );
      }
      fsyncSync(sourceParent);
      if (targetParent !== sourceParent) fsyncSync(targetParent);
      fsyncSync(stage.rootFd);
    } finally {
      if (targetParent !== undefined && targetParent !== stage.rootFd)
        closeSync(targetParent);
      if (sourceParent !== undefined && sourceParent !== stage.rootFd)
        closeSync(sourceParent);
      stage.close();
    }
  }
}
