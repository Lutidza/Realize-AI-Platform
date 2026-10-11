/**
 * @file scripts/release/create-release-manifest.mjs
 * @version 1.0.0
 * @date 2026-10-04
 * @description Записывает общий immutable manifest существующего platform release workflow.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPlatformReleaseManifest,
  hashCanonicalJSON,
} from "@realize/change-engine/platform-release";
import { createReleaseSourceInventory } from "./release-source-inventory.mjs";

const required = (environment, name) => {
  const value = environment[name];
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${name} is required`);
  return value;
};

/** Входы CI доверенные; локальный запуск с подставленными env не доказывает происхождение сборки. */
export const createReleaseManifest = async ({
  environment,
  sourceRoot,
  createdAt = new Date().toISOString(),
}) => {
  const commit = required(environment, "GIT_SHA");
  if (commit !== required(environment, "GITHUB_SHA"))
    throw new Error("Release source differs from workflow commit");
  const digest = required(environment, "IMAGE_DIGEST");
  const reference = `${required(environment, "IMAGE_REPOSITORY")}@${digest}`;
  const repositoryId = required(environment, "GITHUB_REPOSITORY_ID");
  const slug = required(environment, "GITHUB_REPOSITORY");
  const releaseId = required(environment, "RELEASE_ID");
  const inventory = (await createReleaseSourceInventory(sourceRoot)).platform;
  const platform = createPlatformReleaseManifest({
    schemaVersion: 1,
    releaseId,
    createdAt,
    source: {
      git: {
        purpose: "platform-core",
        authority: "platform-owner",
        configurationOwner: "control-plane",
        connectionId: "platform-core-actions",
        revision: 1,
        principalId: `github-actions:${repositoryId}`,
        repository: { provider: "github", id: repositoryId, slug },
        allowedActions: ["read", "publish-release"],
        allowedRefs: ["refs/heads/main"],
      },
      commit,
      ref: required(environment, "GITHUB_REF"),
    },
    artifact: { kind: "oci-image", digest, reference },
    build: {
      provider: "github-actions",
      workflowPath: ".github/workflows/release.yml",
      workflowCommit: commit,
      runId: required(environment, "GITHUB_RUN_ID"),
      runAttempt: Number(required(environment, "GITHUB_RUN_ATTEMPT")),
      provenanceRef: `oci://${reference}#buildkit-provenance`,
    },
    inventory,
    inventoryHash: hashCanonicalJSON(inventory),
  });
  // Старые поля остаются для потребителей handoff; platform является полным контрактом версии.
  return {
    createdAt,
    gitSha: commit,
    image: reference,
    imageDigest: digest,
    releaseId,
    schemaVersion: 1,
    platform,
  };
};

const isEntrypoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  const outputPath = resolve(
    process.argv[2] || "artifacts/release-manifest.json",
  );
  try {
    const manifest = await createReleaseManifest({
      environment: process.env,
      sourceRoot: process.cwd(),
    });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o640,
    });
    console.log(
      `[release] Wrote ${outputPath}; manifest=${manifest.platform.manifestHash}`,
    );
  } catch (error) {
    process.stderr.write(
      `[release] ${error instanceof Error ? error.message : "Manifest creation failed"}\n`,
    );
    process.exitCode = 1;
  }
}
