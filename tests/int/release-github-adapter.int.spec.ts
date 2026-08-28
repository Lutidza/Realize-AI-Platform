/**
 * @file tests/int/release-github-adapter.int.spec.ts
 * @version 2026-08-27
 * @docref ADR-0011
 * @see documentation/architecture/decisions/ADR-0011-github-ghcr-vps-release-preview.md
 * @description Проверяет exact-ref, idempotent GitHub run и artifact-binding release adapter-а.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { prepareGitHubReleaseCandidate } from "../../scripts/release/github-actions-adapter.mjs";
import {
  parseGitHubReleaseRequest,
  readGitHubAdapterConfig,
} from "../../scripts/release/github-release-contract.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

const requestFixture = (repositoryRoot: string) => ({
  candidateKey: "1".repeat(64),
  changeRequestID: "42",
  expiresAt: "2099-01-01T00:00:00.000Z",
  gitCommit: "a".repeat(40),
  repositoryRoot,
  schemaVersion: 1,
  sourceAcceptanceHash: "2".repeat(64),
  sourcePreviewArtifactHash: "3".repeat(64),
  sourcePreviewEvidenceHash: "4".repeat(64),
  targetEnvironment: "production",
});

const resultFixture = (runURL: string) => ({
  configVersion: `sha256:${"5".repeat(64)}`,
  gitCommit: "a".repeat(40),
  healthSummary: "Verified HTTPS preview.",
  imageDigest: `sha256:${"6".repeat(64)}`,
  imageRef: `ghcr.io/realize/app@sha256:${"6".repeat(64)}`,
  manifestHash: "7".repeat(64),
  migrationSetHash: "8".repeat(64),
  migrations: [],
  orchestratorReference: runURL,
  pluginVersions: { payload: "3.88.0" },
  previewStatus: "healthy",
  previewURL: "https://candidate.preview.example.test:24443",
  provenanceRef: "oci://provenance",
  sbomDigest: `sha256:${"9".repeat(64)}`,
  schemaVersion: 1,
  signatureRef: "oci://signature",
  signatureVerified: true,
});

const environmentFixture = {
  GH_TOKEN: "github-token-used-only-through-environment",
  NODE_ENV: "test" as const,
  REALIZE_AI_GITHUB_GH_COMMAND: "/usr/bin/gh",
  REALIZE_AI_GITHUB_GIT_COMMAND: "/usr/bin/git",
  REALIZE_AI_GITHUB_POLL_MS: "1000",
  REALIZE_AI_GITHUB_REPOSITORY: "realize/example",
  REALIZE_AI_GITHUB_RUN_TIMEOUT_MS: "60000",
  REALIZE_AI_GITHUB_WORKFLOW: "prepare-release-candidate.yml",
  REALIZE_AI_GITHUB_WORKFLOW_REF: "main",
};

const fakeExecution = (input: {
  mismatchEvidence?: boolean;
  originRepository?: string;
  request: ReturnType<typeof requestFixture>;
}) => {
  const runURL = "https://github.com/realize/example/actions/runs/77";
  const calls: Array<{ args: string[]; executable: string }> = [];
  let dispatched = false;
  const execute = async (executable: string, args: string[]) => {
    calls.push({ args, executable });
    if (
      executable.endsWith("/git") &&
      args[0] === "remote" &&
      args[1] === "get-url"
    ) {
      return {
        stderr: "",
        stdout: `git@github.com:${input.originRepository || "realize/example"}.git\n`,
      };
    }
    if (executable.endsWith("/git") && args[0] === "rev-parse") {
      return { stderr: "", stdout: `${input.request.gitCommit}\n` };
    }
    if (executable.endsWith("/git") && args.includes("ls-remote")) {
      return { stderr: "", stdout: "" };
    }
    if (executable.endsWith("/git") && args.includes("push")) {
      return { stderr: "", stdout: "" };
    }
    if (args[0] === "workflow" && args[1] === "run") {
      dispatched = true;
      return { stderr: "", stdout: `${runURL}\n` };
    }
    if (args[0] === "run" && args[1] === "list") {
      const runs = dispatched
        ? [
            {
              attempt: 1,
              conclusion: "success",
              createdAt: "2026-08-27T00:00:00Z",
              databaseId: 77,
              displayTitle: `Realize release candidate ${input.request.candidateKey}`,
              status: "completed",
              url: runURL,
            },
          ]
        : [];
      return { stderr: "", stdout: JSON.stringify(runs) };
    }
    if (args[0] === "run" && args[1] === "view") {
      return {
        stderr: "",
        stdout: JSON.stringify({
          attempt: 1,
          conclusion: "success",
          databaseId: 77,
          displayTitle: `Realize release candidate ${input.request.candidateKey}`,
          status: "completed",
          url: runURL,
        }),
      };
    }
    if (args[0] === "run" && args[1] === "download") {
      const outputRoot = args[args.indexOf("--dir") + 1];
      await mkdir(outputRoot, { recursive: true });
      await writeFile(
        resolve(outputRoot, "release-evidence.json"),
        JSON.stringify({
          binding: {
            candidateKey: input.mismatchEvidence
              ? "f".repeat(64)
              : input.request.candidateKey,
            changeRequestID: input.request.changeRequestID,
            gitCommit: input.request.gitCommit,
            sourceAcceptanceHash: input.request.sourceAcceptanceHash,
            sourcePreviewArtifactHash: input.request.sourcePreviewArtifactHash,
            sourcePreviewEvidenceHash: input.request.sourcePreviewEvidenceHash,
            targetEnvironment: "production",
          },
          result: resultFixture(runURL),
          schemaVersion: 1,
        }),
      );
      return { stderr: "", stdout: "" };
    }
    throw new Error(`Unexpected fake command: ${executable} ${args.join(" ")}`);
  };
  return { calls, execute };
};

describe("GitHub release candidate adapter", () => {
  it("pushes one scoped exact ref and accepts only the correlated run artifact", async () => {
    const repositoryRoot = await mkdtemp(resolve(tmpdir(), "release-adapter-"));
    temporaryRoots.push(repositoryRoot);
    const request = requestFixture(repositoryRoot);
    const fake = fakeExecution({ request });

    await expect(
      prepareGitHubReleaseCandidate(request, {
        environment: environmentFixture,
        execute: fake.execute,
        expectedRepositoryRoot: repositoryRoot,
        wait: async () => undefined,
      }),
    ).resolves.toEqual(
      resultFixture("https://github.com/realize/example/actions/runs/77"),
    );

    const push = fake.calls.find((call) => call.args.includes("push"));
    expect(push?.args).toContain(
      `${request.gitCommit}:refs/heads/ai/release-candidates/${request.candidateKey}`,
    );
    expect(push?.args.join(" ")).not.toContain(environmentFixture.GH_TOKEN);
    expect(
      fake.calls.filter(
        (call) => call.args[0] === "workflow" && call.args[1] === "run",
      ),
    ).toHaveLength(1);
  });

  it("rejects an artifact whose binding belongs to another candidate", async () => {
    const repositoryRoot = await mkdtemp(resolve(tmpdir(), "release-adapter-"));
    temporaryRoots.push(repositoryRoot);
    const request = requestFixture(repositoryRoot);
    const fake = fakeExecution({ mismatchEvidence: true, request });

    await expect(
      prepareGitHubReleaseCandidate(request, {
        environment: environmentFixture,
        execute: fake.execute,
        expectedRepositoryRoot: repositoryRoot,
        wait: async () => undefined,
      }),
    ).rejects.toThrow("does not match the dispatched candidate");
  });

  it("rejects a configured repository that differs from Git origin", async () => {
    const repositoryRoot = await mkdtemp(resolve(tmpdir(), "release-adapter-"));
    temporaryRoots.push(repositoryRoot);
    const request = requestFixture(repositoryRoot);
    const fake = fakeExecution({
      originRepository: "realize/another-repository",
      request,
    });

    await expect(
      prepareGitHubReleaseCandidate(request, {
        environment: environmentFixture,
        execute: fake.execute,
        expectedRepositoryRoot: repositoryRoot,
        wait: async () => undefined,
      }),
    ).rejects.toThrow("differs from Git origin");
    expect(fake.calls.some((call) => call.args.includes("push"))).toBe(false);
  });

  it("fails before side effects for relative tools or a non-canonical expiry", () => {
    expect(() =>
      readGitHubAdapterConfig({
        ...environmentFixture,
        REALIZE_AI_GITHUB_GH_COMMAND: "gh",
      }),
    ).toThrow("absolute paths");
    expect(() =>
      parseGitHubReleaseRequest(
        { ...requestFixture(process.cwd()), expiresAt: "2099-01-01" },
        process.cwd(),
      ),
    ).toThrow("expiresAt must be in the future");
  });
});
