/**
 * @file tests/int/platformRelease.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Проверяет происхождение manifest, совместимость установки и разделение Git-полномочий.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  exactVersionSchema,
  gitDeliveryBindingSchema,
  platformSourceInventorySchema,
  type PlatformReleaseManifest,
} from "@realize/ai-contracts/platform-release";
import {
  assertGitDeliveryRequest,
  comparePlatformInstallation,
  createMigrationSetHash,
  createPlatformReleaseManifest,
  hashCanonicalJSON,
  verifyPlatformSourceInventory,
} from "@realize/change-engine/platform-release";
import { createReleaseManifest } from "../../scripts/release/create-release-manifest.mjs";
import {
  createPlatformReleaseFixture,
  installedPlatformFixture,
  platformReleaseEnvironment,
} from "./support/platformRelease.fixture";

let release: PlatformReleaseManifest;
beforeAll(async () => {
  release = await createPlatformReleaseFixture();
}, 20000);

const compare = (
  installed = installedPlatformFixture(release),
  manifest = release,
  audience: "development" | "external" = "development",
) =>
  comparePlatformInstallation({
    manifest,
    installed,
    audience,
    expectedManifestHash: manifest.manifestHash,
    expectedPlatformRepositoryId: "101",
    checkedAt: "2026-10-04T00:00:00.000Z",
  });

describe("exact platform release", () => {
  it("binds real workspace versions, ordered migrations and workflows to the OCI source", () => {
    const installed = installedPlatformFixture(release);
    const result = compare(installed);
    expect(result.compatible).toBe(true);
    expect(installed.project.commit).not.toBe(release.source.commit);
    expect(result.installedStateHash).toBe(hashCanonicalJSON(installed));
    expect(release.inventory.components.map((item) => item.id)).toContain(
      "@realize/payload-ai-control",
    );
    expect(release.inventory.unavailable.map((item) => item.kind)).toEqual([
      "model-catalog",
      "routing-policy",
      "pricing",
    ]);
    expect(release.artifact.reference).toBe(
      `ghcr.io/fixture/platform@${release.artifact.digest}`,
    );
  });

  it("keeps canonical manifest identity independent of object key order", () => {
    const { manifestHash, ...payload } = release;
    expect(
      createPlatformReleaseManifest(
        Object.fromEntries(Object.entries(payload).reverse()),
      ).manifestHash,
    ).toBe(manifestHash);
  });

  it.each(["^1.0.0", "latest", "01.0.0", "1.0", "v1.0.0", "1.0.0-01"])(
    "rejects non-exact version %s",
    (version) => {
      expect(exactVersionSchema.safeParse(version).success).toBe(false);
    },
  );

  it.each(["0.1.0", "1.0.0-rc.1+build.123", "2.0.0+001"])(
    "accepts exact version %s",
    (version) => {
      expect(exactVersionSchema.parse(version)).toBe(version);
    },
  );

  it("rejects a changed artifact even if its shape is valid", () => {
    const changed = structuredClone(release);
    changed.artifact.digest = `sha256:${"d".repeat(64)}`;
    changed.artifact.reference = `ghcr.io/fixture/platform@${changed.artifact.digest}`;
    expect(() => compare(installedPlatformFixture(release), changed)).toThrow(
      "integrity",
    );
  });

  it("rejects an untrusted expected origin or hash", () => {
    const input = {
      manifest: release,
      installed: installedPlatformFixture(release),
      audience: "development" as const,
      checkedAt: "2026-10-04T00:00:00.000Z",
    };
    expect(() =>
      comparePlatformInstallation({
        ...input,
        expectedManifestHash: release.manifestHash,
        expectedPlatformRepositoryId: "202",
      }),
    ).toThrow("origin");
    expect(() =>
      comparePlatformInstallation({
        ...input,
        expectedManifestHash: "0".repeat(64),
        expectedPlatformRepositoryId: "101",
      }),
    ).toThrow("origin");
  });

  it("detects source-content tampering and migration reordering separately from the legacy set hash", () => {
    const inventory = structuredClone(release.inventory);
    inventory.components[0].files[0].sha256 = "0".repeat(64);
    expect(() => verifyPlatformSourceInventory(inventory)).toThrow(
      "source hash",
    );
    const reordered = structuredClone(release.inventory);
    reordered.schema.migrations.reverse();
    expect(createMigrationSetHash(reordered.schema.migrations)).toBe(
      release.inventory.schema.migrationSetHash,
    );
    expect(() => verifyPlatformSourceInventory(reordered)).toThrow("order");
  });

  it.each(["minor", "content", "missing", "unknown"])(
    "rejects an unsupported installed combination: %s",
    (change) => {
      const installed = installedPlatformFixture(release);
      if (change === "minor") installed.components[0].version = "0.2.0";
      if (change === "content") installed.components[0].sha256 = "0".repeat(64);
      if (change === "missing") installed.components.pop();
      if (change === "unknown")
        installed.components.push({
          id: "model-garden",
          version: "1.0.0",
          sha256: "0".repeat(64),
        });
      expect(compare(installed).compatible).toBe(false);
    },
  );

  it("rejects dirty state, unknown base and schema drift with separate reasons", () => {
    const installed = installedPlatformFixture(release);
    installed.core.sourceCommit = "d".repeat(40);
    installed.project.hasUncommittedChanges = true;
    installed.migrationOrderHash = "0".repeat(64);
    expect(compare(installed).issues.map((item) => item.code)).toEqual([
      "CORE_BASE_MISMATCH",
      "DIRTY_PROJECT",
      "SCHEMA_MISMATCH",
    ]);
  });

  it("accepts an explicit extension point and rejects an unknown provider contract", () => {
    const installed = installedPlatformFixture(release);
    const provider = installed.components.find(
      (item) => item.id === "@realize/payload-ai-control",
    )!;
    installed.extensions.push({
      id: "client-plugin-options",
      version: "1.0.0",
      sha256: "1".repeat(64),
      extensionPointId: "payload-ai-plugin-options",
      extensionPointVersion: "0.1.0",
      requires: [provider],
    });
    expect(compare(installed).compatible).toBe(true);
    installed.extensions[0].extensionPointVersion = "0.2.0";
    expect(compare(installed).issues[0].code).toBe("EXTENSION_INCOMPATIBLE");
  });

  it("does not advertise a development release as supported for external clients", () => {
    expect(compare(undefined, release, "external").issues[0].code).toBe(
      "DEVELOPMENT_RELEASE",
    );
  });

  it("enforces end-of-support and preserves the immutable previous manifest", () => {
    const { manifestHash: previousHash, ...payload } = structuredClone(release);
    payload.inventory.support = {
      status: "deprecated",
      announcedAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-10-04T00:00:00.000Z",
      replacementVersion: "2.0.0",
      reason: "Protocol replacement",
      migrationGuide: "https://example.test/migrate",
    };
    payload.inventoryHash = hashCanonicalJSON(payload.inventory);
    const deprecated = createPlatformReleaseManifest(payload);
    expect(
      compare(installedPlatformFixture(deprecated), deprecated, "external")
        .issues[0].code,
    ).toBe("SUPPORT_EXPIRED");
    expect(release.manifestHash).toBe(previousHash);
    expect(release.inventory.support.status).toBe("development");
  });

  it("rejects unknown schema fields, duplicate units and missing availability declarations", () => {
    expect(
      platformSourceInventorySchema.safeParse({
        ...release.inventory,
        schemaVersion: 2,
      }).success,
    ).toBe(false);
    expect(
      platformSourceInventorySchema.safeParse({
        ...release.inventory,
        token: "not-a-secret",
      }).success,
    ).toBe(false);
    expect(
      platformSourceInventorySchema.safeParse({
        ...release.inventory,
        components: [
          ...release.inventory.components,
          release.inventory.components[0],
        ],
      }).success,
    ).toBe(false);
    expect(
      platformSourceInventorySchema.safeParse({
        ...release.inventory,
        unavailable: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a workflow that is not part of the exact source", () => {
    const { manifestHash: _hash, ...payload } = structuredClone(release);
    payload.build.workflowCommit = "d".repeat(40);
    expect(() => createPlatformReleaseManifest(payload)).toThrow("workflow");
    payload.build.workflowCommit = release.source.commit;
    payload.build.workflowPath = ".github/workflows/unknown.yml";
    expect(() => createPlatformReleaseManifest(payload)).toThrow("workflow");
  });

  it("requires trusted CI source identity before generating a release", async () => {
    await expect(
      createReleaseManifest({
        sourceRoot: process.cwd(),
        environment: {
          ...platformReleaseEnvironment,
          GITHUB_SHA: "d".repeat(40),
        },
      }),
    ).rejects.toThrow("workflow commit");
  });
});

describe("Git delivery purposes", () => {
  const requestFor = (manifest: PlatformReleaseManifest) => ({
    purpose: "platform-core",
    connectionId: manifest.source.git.connectionId,
    revision: manifest.source.git.revision,
    principalId: manifest.source.git.principalId,
    repositoryId: manifest.source.git.repository.id,
    action: "publish-release",
    ref: "refs/heads/main",
  });

  it("authorizes only an explicit action of the matching trusted connection", () => {
    expect(() =>
      assertGitDeliveryRequest(release.source.git, requestFor(release)),
    ).not.toThrow();
    expect(() =>
      assertGitDeliveryRequest(release.source.git, {
        ...requestFor(release),
        action: "deploy",
      }),
    ).toThrow("scope");
    expect(() =>
      assertGitDeliveryRequest(release.source.git, {
        ...requestFor(release),
        ref: "refs/heads/other",
      }),
    ).toThrow("scope");
  });

  it.each([
    "purpose",
    "repositoryId",
    "principalId",
    "revision",
    "connectionId",
    "installationId",
  ])("rejects a changed Git boundary: %s", (field) => {
    const replacement =
      field === "purpose"
        ? "customer-project"
        : field === "revision"
          ? 3
          : field === "repositoryId"
            ? "202"
            : "other";
    expect(() =>
      assertGitDeliveryRequest(release.source.git, {
        ...requestFor(release),
        [field]: replacement,
      }),
    ).toThrow("scope");
  });

  it("forbids client-owned settings from claiming platform authority", () => {
    expect(
      gitDeliveryBindingSchema.safeParse({
        ...release.source.git,
        configurationOwner: "installation",
      }).success,
    ).toBe(false);
    expect(
      gitDeliveryBindingSchema.safeParse({
        ...release.source.git,
        credential: "not-a-secret",
      }).success,
    ).toBe(false);
    const installed = installedPlatformFixture(release);
    expect(() =>
      assertGitDeliveryRequest(installed.project.git, requestFor(release)),
    ).toThrow("scope");
    installed.project.git.principalId = release.source.git.principalId;
    expect(compare(installed).issues[0].code).toBe("GIT_SCOPE_COLLISION");
  });

  it.each([
    "refs/heads/.hidden",
    "refs/heads/name.lock/child",
    "refs/heads/../main",
  ])("rejects unsafe Git ref %s", (ref) => {
    expect(
      gitDeliveryBindingSchema.safeParse({
        ...release.source.git,
        allowedRefs: [ref],
      }).success,
    ).toBe(false);
  });
});
