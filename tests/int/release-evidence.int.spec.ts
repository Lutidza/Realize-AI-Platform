// @vitest-environment node
/**
 * @file tests/int/release-evidence.int.spec.ts
 * @version 1.1.1
 * @date 2026-11-05
 * @docref ADR-0011
 * @see documentation/architecture/decisions/ADR-0011-github-ghcr-vps-release-preview.md
 * @description Проверяет воспроизводимый manifest, migration binding и strict worker result.
 */

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { createMigrationSetHash } from "@realize/change-engine";
import { hashCanonicalJSON } from "@realize/change-engine/platform-release";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createReleaseCandidateEvidence } from "../../scripts/release/create-release-candidate-evidence.mjs";
import * as releaseInventory from "../../scripts/release/release-source-inventory.mjs";
import * as platformInventory from "../../scripts/release/createPlatformSourceInventory.service";
import * as releaseFiles from "../../scripts/release/readReleaseSourceFiles.adapter";
import { parseReleaseOrchestratorResult } from "../../services/ai-execution-worker/src/releaseOrchestrator";

const temporaryRoots: string[] = [];
const activeScenarios = new Set<Promise<void>>();
const phaseLogBuffers = new Map<string, Array<Record<string, unknown>>>();

type DiagnosticScenario = { id: string; name: string };

const unmeasuredEvidencePhases = [
  "internal_evidence_read",
  "internal_hash",
  "internal_output_write",
] as const;

const logReleaseEvidencePhase = (
  scenario: DiagnosticScenario,
  phase: string,
  durationMs: number | null,
  details: Record<string, unknown> = {},
) => {
  const event = {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    phase,
    durationMs: durationMs === null ? null : Number(durationMs.toFixed(3)),
    boundary: durationMs === null ? "not_measured" : "inclusive",
    ...(durationMs === null
      ? { measurement: "not_observable_from_test_scope" }
      : {}),
    ...details,
  };
  const buffer = phaseLogBuffers.get(scenario.id);
  if (buffer) buffer.push(event);
  else console.info(`[release-evidence-phase] ${JSON.stringify(event)}`);
};

const measureReleasePhase = async <T>(
  scenario: DiagnosticScenario,
  phase: string,
  work: () => Promise<T>,
  describe?: (value: T) => Record<string, unknown>,
): Promise<T> => {
  const startedAt = performance.now();
  let details: Record<string, unknown> = { outcome: "error" };
  try {
    const value = await work();
    details = { outcome: "success", ...describe?.(value) };
    return value;
  } finally {
    logReleaseEvidencePhase(
      scenario,
      phase,
      performance.now() - startedAt,
      details,
    );
  }
};

const measureReleaseScenario = async (
  scenario: DiagnosticScenario,
  work: () => Promise<void>,
) => {
  const bufferedEvents: Array<Record<string, unknown>> = [];
  phaseLogBuffers.set(scenario.id, bufferedEvents);
  const startedAt = performance.now();
  const operation = work();
  activeScenarios.add(operation);
  try {
    await operation;
  } finally {
    const durationMs = performance.now() - startedAt;
    activeScenarios.delete(operation);
    phaseLogBuffers.delete(scenario.id);
    for (const event of bufferedEvents)
      console.info(`[release-evidence-phase] ${JSON.stringify(event)}`);
    logReleaseEvidencePhase(scenario, "scenario_total", durationMs);
    for (const phase of unmeasuredEvidencePhases)
      logReleaseEvidencePhase(scenario, phase, null);
  }
};

afterEach(async () => {
  // Vitest timeout не отменяет async I/O: fixture удаляется после завершения её реального producer.
  await Promise.allSettled([...activeScenarios]);
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const fixture = async (scenario?: DiagnosticScenario) => {
  const fixtureStartedAt = performance.now();
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
  if (scenario)
    logReleaseEvidencePhase(
      scenario,
      "fixture_setup",
      performance.now() - fixtureStartedAt,
    );
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
    const scenario = {
      id: "deterministic-exact-source-manifest",
      name: "creates a deterministic exact-source manifest accepted by the worker",
    };
    const originals = {
      source: releaseInventory.createReleaseSourceInventory,
      platform: platformInventory.createPlatformSourceInventory,
      files: releaseFiles.readReleaseSourceFiles,
      json: releaseFiles.readReleaseSourceJSON,
      manifests: releaseFiles.readReleaseWorkspacePackageManifests,
    };
    let sourceReadNumber = 0;
    const spies = [
      vi
        .spyOn(releaseInventory, "createReleaseSourceInventory")
        .mockImplementation((root) =>
          measureReleasePhase(
            scenario,
            "internal_source_inventory",
            () => originals.source(root),
            (value) => ({
              components: value.platform.components.length,
              migrations: value.migrations.length,
            }),
          ),
        ),
      vi
        .spyOn(platformInventory, "createPlatformSourceInventory")
        .mockImplementation((input) =>
          measureReleasePhase(
            scenario,
            "platform_source_inventory",
            () => originals.platform(input),
            (value) => ({
              components: value.components.length,
              files: value.components.reduce(
                (sum, component) => sum + component.files.length,
                0,
              ),
            }),
          ),
        ),
      vi
        .spyOn(releaseFiles, "readReleaseSourceFiles")
        .mockImplementation((input) => {
          const invocationId = `source-inventory-${++sourceReadNumber}`;
          return measureReleasePhase(
            scenario,
            "component_source_files",
            () => originals.files(input),
            (files) => ({ invocationId, files: files.length }),
          );
        }),
      vi
        .spyOn(releaseFiles, "readReleaseSourceJSON")
        .mockImplementation((root, path) =>
          measureReleasePhase(scenario, "source_json_read", () =>
            originals.json(root, path),
          ),
        ),
      vi
        .spyOn(releaseFiles, "readReleaseWorkspacePackageManifests")
        .mockImplementation((root) =>
          measureReleasePhase(
            scenario,
            "workspace_package_manifests",
            () => originals.manifests(root),
            (manifests) => ({ packages: manifests.length }),
          ),
        ),
    ];
    try {
      await measureReleaseScenario(scenario, async () => {
        const input = await fixture(scenario);
        const first = await measureReleasePhase(
          scenario,
          "createReleaseCandidateEvidence_call_1",
          () => createReleaseCandidateEvidence(input),
        );
        const second = await measureReleasePhase(
          scenario,
          "createReleaseCandidateEvidence_call_2",
          () =>
            createReleaseCandidateEvidence({
              ...input,
              outputRoot: resolve(input.outputRoot, "second"),
            }),
        );
        expect(sourceReadNumber).toBeGreaterThan(0);

        expect(first.manifestHash).toBe(second.manifestHash);
        expect(first.manifest.platformBase).toEqual({ status: "unresolved" });
        expect(first.manifest.sourceInventoryHash).toBe(
          hashCanonicalJSON(first.manifest.sourceInventory),
        );
        expect(
          first.manifest.sourceInventory.components.some(
            (item) => item.id === "@realize/ai-contracts",
          ),
        ).toBe(true);
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
        await measureReleasePhase(
          scenario,
          "output_file_read_and_validation",
          async () => {
            const output = await readFile(
              resolve(input.outputRoot, "release-evidence.json"),
              "utf8",
            );
            expect(JSON.parse(output)).toEqual(first.envelope);
          },
        );
      });
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
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
