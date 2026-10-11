/**
 * @file tests/int/support/platformRelease.fixture.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Создаёт явно синтетические Git/image входы для проверки реального release inventory.
 */

import type {
  InstalledPlatformState,
  PlatformReleaseManifest,
} from "@realize/ai-contracts/platform-release";
import { createReleaseManifest } from "../../../scripts/release/create-release-manifest.mjs";

export const platformReleaseEnvironment = {
  GIT_SHA: "a".repeat(40),
  GITHUB_SHA: "a".repeat(40),
  GITHUB_REF: "refs/heads/main",
  GITHUB_REPOSITORY_ID: "101",
  GITHUB_REPOSITORY: "fixture/platform",
  GITHUB_RUN_ID: "123",
  GITHUB_RUN_ATTEMPT: "1",
  IMAGE_DIGEST: `sha256:${"b".repeat(64)}`,
  IMAGE_REPOSITORY: "ghcr.io/fixture/platform",
  RELEASE_ID: "fixture-release",
};

export const createPlatformReleaseFixture =
  async (): Promise<PlatformReleaseManifest> =>
    (
      await createReleaseManifest({
        environment: platformReleaseEnvironment,
        sourceRoot: process.cwd(),
        createdAt: "2026-10-04T00:00:00.000Z",
      })
    ).platform;

/** Наблюдаемое состояние моделируется тестом; это не запись о реальной установленной версии. */
export const installedPlatformFixture = (
  manifest: PlatformReleaseManifest,
): InstalledPlatformState => ({
  schemaVersion: 1,
  installationId: "fixture-installation",
  core: {
    manifestHash: manifest.manifestHash,
    sourceCommit: manifest.source.commit,
    platformVersion: manifest.inventory.platformVersion,
    imageDigest: manifest.artifact.digest,
  },
  project: {
    git: {
      purpose: "customer-project",
      authority: "installation-admin",
      configurationOwner: "installation",
      installationId: "fixture-installation",
      connectionId: "customer-github",
      revision: 2,
      principalId: "customer-bot",
      repository: { provider: "github", id: "202", slug: "fixture/customer" },
      allowedActions: ["read", "publish-source"],
      allowedRefs: ["refs/heads/ai/update-1"],
    },
    commit: "c".repeat(40),
    hasUncommittedChanges: false,
  },
  components: manifest.inventory.components.map(({ id, version, sha256 }) => ({
    id,
    version,
    sha256,
  })),
  migrationOrderHash: manifest.inventory.schema.migrationOrderHash,
  extensions: [],
});
