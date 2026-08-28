/**
 * @file tests/int/release-evidence.int.spec.ts
 * @version 2026-08-27
 * @docref ADR-0011
 * @see documentation/architecture/decisions/ADR-0011-github-ghcr-vps-release-preview.md
 * @description Проверяет воспроизводимый manifest, migration binding и strict worker result.
 */

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { createMigrationSetHash } from "@realize/change-engine";
import { afterEach, describe, expect, it } from "vitest";

import { createReleaseCandidateEvidence } from "../../scripts/release/create-release-candidate-evidence.mjs";
import { parseReleaseOrchestratorResult } from "../../services/ai-execution-worker/src/releaseOrchestrator";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const fixture = async () => {
  const root = await mkdtemp(resolve(tmpdir(), "release-evidence-"));
  temporaryRoots.push(root);
  const candidateKey = "1".repeat(64);
  const gitCommit = "a".repeat(40);
  const imageDigest = `sha256:${"b".repeat(64)}`;
  const sbom = JSON.stringify({ SPDX: { name: "candidate" } });
  const paths = {
    outputRoot: resolve(root, "output"),
    previewPath: resolve(root, "preview.json"),
    provenancePath: resolve(root, "provenance.json"),
    sbomPath: resolve(root, "sbom.json"),
    signatureVerificationPath: resolve(root, "signature.json"),
  };
  await Promise.all([
    writeFile(
      paths.previewPath,
      JSON.stringify({
        candidateKey,
        gitCommit,
        healthSummary: "HTTPS readiness passed.",
        previewStatus: "healthy",
        previewURL: "https://1111111111111111.preview.example.test:24443",
        schemaVersion: 1,
      }),
    ),
    writeFile(
      paths.provenancePath,
      JSON.stringify({ SLSA: { builder: "buildx" } }),
    ),
    writeFile(paths.sbomPath, sbom),
    writeFile(
      paths.signatureVerificationPath,
      JSON.stringify([
        {
          critical: { image: { "docker-manifest-digest": imageDigest } },
          optional: {
            "realize.candidate-key": candidateKey,
            "realize.git-commit": gitCommit,
          },
        },
      ]),
    ),
  ]);
  return {
    environment: {
      CANDIDATE_KEY: candidateKey,
      CHANGE_REQUEST_ID: "42",
      EXPIRES_AT: "2099-01-01T00:00:00.000Z",
      GIT_COMMIT: gitCommit,
      GIT_COMMIT_CREATED_AT: "2026-08-27T00:00:00+00:00",
      IMAGE_DIGEST: imageDigest,
      IMAGE_REF: `ghcr.io/realize/app@${imageDigest}`,
      INSTALLATION_ID: "realize-primary",
      ORCHESTRATOR_REFERENCE:
        "https://github.com/realize/example/actions/runs/77",
      PROVENANCE_REF: `oci://ghcr.io/realize/app@${imageDigest}#buildkit-provenance`,
      SBOM_DIGEST: `sha256:${sha256(sbom)}`,
      SIGNATURE_REF: `oci://ghcr.io/realize/app@${imageDigest}#sigstore`,
      SOURCE_ACCEPTANCE_HASH: "2".repeat(64),
      SOURCE_PREVIEW_ARTIFACT_HASH: "3".repeat(64),
      SOURCE_PREVIEW_EVIDENCE_HASH: "4".repeat(64),
    },
    ...paths,
    sourceRoot: process.cwd(),
  };
};

describe("release candidate evidence", () => {
  it("creates a deterministic exact-source manifest accepted by the worker", async () => {
    const input = await fixture();
    const first = await createReleaseCandidateEvidence(input);
    const second = await createReleaseCandidateEvidence({
      ...input,
      outputRoot: resolve(input.outputRoot, "second"),
    });

    expect(first.manifestHash).toBe(second.manifestHash);
    expect(first.manifest.migrationSetHash).toBe(
      createMigrationSetHash(
        first.manifest.migrations.map((migration) => ({
          ...migration,
          direction: "up" as const,
        })),
      ),
    );
    expect(Object.keys(first.manifest.pluginVersions)).toEqual(
      expect.arrayContaining(["@realize/payload-ai-control", "payload"]),
    );
    expect(parseReleaseOrchestratorResult(first.envelope.result)).toEqual(
      first.envelope.result,
    );
    expect(
      JSON.parse(
        await readFile(
          resolve(input.outputRoot, "release-evidence.json"),
          "utf8",
        ),
      ),
    ).toEqual(first.envelope);
  });

  it("rejects security evidence after an SBOM mutation", async () => {
    const input = await fixture();
    await writeFile(
      input.sbomPath,
      JSON.stringify({ SPDX: { tampered: true } }),
    );
    await expect(createReleaseCandidateEvidence(input)).rejects.toThrow(
      "does not match SBOM_DIGEST",
    );
  });
});
