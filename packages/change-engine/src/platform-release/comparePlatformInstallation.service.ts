/**
 * @file packages/change-engine/src/platform-release/comparePlatformInstallation.service.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Сопоставляет доверенный exact manifest с наблюдаемой основой клиентского проекта.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import {
  installedPlatformStateSchema,
  platformReleaseManifestSchema,
  type ComparePlatformInstallationInput,
  type PlatformCompatibilityEvidence,
} from "@realize/ai-contracts/platform-release";
import { hashCanonicalJSON } from "../canonicalJson.ts";
import { createPlatformReleaseManifest } from "./createPlatformReleaseManifest.service.ts";

/** Caller отдельно проверяет signature/issuer и actual state; результат не разрешает update/deploy. */
export const comparePlatformInstallation = (
  input: ComparePlatformInstallationInput,
): PlatformCompatibilityEvidence => {
  if (
    !["development", "external"].includes(input.audience) ||
    !Number.isFinite(Date.parse(input.checkedAt)) ||
    new Date(input.checkedAt).toISOString() !== input.checkedAt
  ) {
    throw new Error("Compatibility audience and timestamp must be explicit");
  }
  const manifest = platformReleaseManifestSchema.parse(input.manifest);
  const { manifestHash, ...payload } = manifest;
  if (
    createPlatformReleaseManifest(payload).manifestHash !== manifestHash ||
    manifestHash !== input.expectedManifestHash ||
    manifest.source.git.repository.id !== input.expectedPlatformRepositoryId
  ) {
    throw new Error("Release integrity or trusted origin mismatch");
  }
  const installed = installedPlatformStateSchema.parse(input.installed);
  const issues: PlatformCompatibilityEvidence["issues"] = [];
  const issue = (code: string, path: string, message: string) => {
    issues.push({ code, path, message });
  };
  if (
    installed.project.git.connectionId === manifest.source.git.connectionId ||
    installed.project.git.principalId === manifest.source.git.principalId ||
    installed.project.git.repository.id === manifest.source.git.repository.id
  ) {
    issue(
      "GIT_SCOPE_COLLISION",
      "project.git",
      "Core and customer Git require separate repository, principal and connection identities",
    );
  }
  if (
    installed.core.manifestHash !== manifestHash ||
    installed.core.sourceCommit !== manifest.source.commit ||
    installed.core.platformVersion !== manifest.inventory.platformVersion ||
    installed.core.imageDigest !== manifest.artifact.digest
  ) {
    issue(
      "CORE_BASE_MISMATCH",
      "core",
      "Installed core does not match the selected immutable release",
    );
  }
  if (installed.project.hasUncommittedChanges)
    issue(
      "DIRTY_PROJECT",
      "project",
      "Uncommitted changes require an isolated update plan",
    );
  if (
    installed.migrationOrderHash !==
    manifest.inventory.schema.migrationOrderHash
  ) {
    issue(
      "SCHEMA_MISMATCH",
      "migrationOrderHash",
      "Installed migration order/checksums differ; a database plan is required",
    );
  }
  const support = manifest.inventory.support;
  if (support.status === "development" && input.audience === "external") {
    issue(
      "DEVELOPMENT_RELEASE",
      "support",
      "External support has not been declared for this release",
    );
  } else if (
    support.status !== "development" &&
    Date.parse(input.checkedAt) >= Date.parse(support.endsAt)
  ) {
    issue(
      "SUPPORT_EXPIRED",
      "support",
      "The declared support period has ended",
    );
  }
  const expected = new Map(
    manifest.inventory.components.map((item) => [item.id, item]),
  );
  const observed = new Map(installed.components.map((item) => [item.id, item]));
  for (const [id, component] of expected) {
    const actual = observed.get(id);
    if (
      !actual ||
      actual.version !== component.version ||
      actual.sha256 !== component.sha256
    ) {
      issue(
        "COMPONENT_MISMATCH",
        `components.${id}`,
        "Exact version and content hash are required",
      );
    }
  }
  for (const id of observed.keys()) {
    if (!expected.has(id))
      issue(
        "UNKNOWN_COMPONENT",
        `components.${id}`,
        "Component is not part of the supported release combination",
      );
  }
  for (const extension of installed.extensions) {
    const point = manifest.inventory.compatibility.extensionPoints.find(
      (item) => item.id === extension.extensionPointId,
    );
    if (
      expected.has(extension.id) ||
      !point ||
      point.version !== extension.extensionPointVersion ||
      !extension.requires.some(
        (item) => item.id === point.providerComponentId,
      ) ||
      extension.requires.some((item) => {
        const component = expected.get(item.id);
        return (
          !component ||
          component.version !== item.version ||
          component.sha256 !== item.sha256
        );
      })
    ) {
      issue(
        "EXTENSION_INCOMPATIBLE",
        `extensions.${extension.id}`,
        "Extension point/provider/dependency pins are unsupported",
      );
    }
  }
  return {
    schemaVersion: 1,
    compatible: issues.length === 0,
    manifestHash,
    inventoryHash: manifest.inventoryHash,
    installedStateHash: hashCanonicalJSON(installed),
    checkedAt: input.checkedAt,
    issues,
  };
};
