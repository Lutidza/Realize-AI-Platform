/**
 * @file scripts/release/github-actions-adapter.mjs
 * @version 1.0.0
 * @date 2026-10-22
 * @docref ADR-0011
 * @see documentation/architecture/decisions/ADR-0011-github-ghcr-vps-release-preview.md
 * @description Связывает release candidate с точным GitHub Actions run и подтверждённым артефактом.
 */

import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { runCommand } from "../migrations/command-runner.mjs";
import { pushCandidateCommit } from "./github-candidate-ref.mjs";
import {
  asObject,
  candidateTitle,
  parseGitHubReleaseRequest,
  parseJSON,
  readGitHubAdapterConfig,
} from "./github-release-contract.mjs";

const maximumEvidenceBytes = 1_000_000;

const commandEnvironment = (config, temporaryRoot) => ({
  GH_CONFIG_DIR: resolve(temporaryRoot, "gh-config"),
  GH_PROMPT_DISABLED: "1",
  GH_TOKEN: config.token,
  LANG: "C.UTF-8",
  NO_COLOR: "1",
});

const listCandidateRuns = async (input, execute, environment) => {
  const response = await execute(
    input.config.ghCommand,
    [
      "run",
      "list",
      "--repo",
      input.config.repository,
      "--workflow",
      input.config.workflow,
      "--branch",
      input.config.workflowRef,
      "--event",
      "workflow_dispatch",
      "--limit",
      "1000",
      "--json",
      "attempt,conclusion,createdAt,databaseId,displayTitle,status,url",
    ],
    {
      cwd: input.request.repositoryRoot,
      env: environment,
      secrets: [input.config.token],
    },
  );
  const runs = parseJSON(response.stdout, "gh run list");
  if (!Array.isArray(runs))
    throw new Error("gh run list did not return an array.");
  const matching = runs.filter(
    (run) =>
      asObject(run, "Workflow run").displayTitle ===
      candidateTitle(input.request.candidateKey),
  );
  if (matching.length > 1)
    throw new Error("Multiple workflow runs match one candidate key.");
  return matching[0];
};

const dispatchCandidate = async (input, execute, environment) => {
  const request = input.request;
  await execute(
    input.config.ghCommand,
    [
      "workflow",
      "run",
      input.config.workflow,
      "--repo",
      input.config.repository,
      "--ref",
      input.config.workflowRef,
      "--raw-field",
      `candidate_key=${request.candidateKey}`,
      "--raw-field",
      `change_request_id=${request.changeRequestID}`,
      "--raw-field",
      `expires_at=${request.expiresAt}`,
      "--raw-field",
      `git_commit=${request.gitCommit}`,
      "--raw-field",
      `source_acceptance_hash=${request.sourceAcceptanceHash}`,
      "--raw-field",
      `source_preview_artifact_hash=${request.sourcePreviewArtifactHash}`,
      "--raw-field",
      `source_preview_evidence_hash=${request.sourcePreviewEvidenceHash}`,
    ],
    {
      cwd: request.repositoryRoot,
      env: environment,
      secrets: [input.config.token],
    },
  );
};

const waitForRun = async (input, execute, environment, wait) => {
  const deadline = Date.now() + input.config.runTimeoutMs;
  let run = await listCandidateRuns(input, execute, environment);
  if (!run) {
    await dispatchCandidate(input, execute, environment);
    while (!run && Date.now() < deadline) {
      await wait(input.config.pollMs);
      run = await listCandidateRuns(input, execute, environment);
    }
  }
  if (!run)
    throw new Error(
      "Dispatched workflow run was not correlated before timeout.",
    );
  while (Date.now() < deadline) {
    const response = await execute(
      input.config.ghCommand,
      [
        "run",
        "view",
        String(run.databaseId),
        "--repo",
        input.config.repository,
        "--json",
        "attempt,conclusion,databaseId,displayTitle,status,url",
      ],
      {
        cwd: input.request.repositoryRoot,
        env: environment,
        secrets: [input.config.token],
      },
    );
    run = asObject(parseJSON(response.stdout, "gh run view"), "Workflow run");
    if (run.displayTitle !== candidateTitle(input.request.candidateKey)) {
      throw new Error("Correlated workflow run changed identity.");
    }
    if (run.status === "completed") {
      if (run.conclusion !== "success") {
        throw new Error(
          `Release candidate workflow concluded with ${run.conclusion || "unknown"}.`,
        );
      }
      return run;
    }
    await wait(input.config.pollMs);
  }
  throw new Error("Release candidate workflow timed out.");
};

const readEvidence = async (
  input,
  run,
  execute,
  environment,
  temporaryRoot,
) => {
  const artifactName = `release-candidate-${input.request.candidateKey}-${run.databaseId}-${run.attempt}`;
  const artifactRoot = resolve(temporaryRoot, "artifact");
  await execute(
    input.config.ghCommand,
    [
      "run",
      "download",
      String(run.databaseId),
      "--repo",
      input.config.repository,
      "--name",
      artifactName,
      "--dir",
      artifactRoot,
    ],
    {
      cwd: input.request.repositoryRoot,
      env: environment,
      secrets: [input.config.token],
    },
  );
  const evidencePath = resolve(artifactRoot, "release-evidence.json");
  const stats = await lstat(evidencePath);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size > maximumEvidenceBytes
  ) {
    throw new Error("Release evidence artifact is not a bounded regular file.");
  }
  const envelope = asObject(
    parseJSON(
      await readFile(evidencePath, "utf8"),
      "Release evidence artifact",
    ),
    "Release evidence artifact",
  );
  const binding = asObject(envelope.binding, "Release evidence binding");
  const result = asObject(envelope.result, "Release evidence result");
  const expected = input.request;
  if (
    envelope.schemaVersion !== 1 ||
    binding.candidateKey !== expected.candidateKey ||
    binding.changeRequestID !== expected.changeRequestID ||
    binding.gitCommit !== expected.gitCommit ||
    binding.sourceAcceptanceHash !== expected.sourceAcceptanceHash ||
    binding.sourcePreviewArtifactHash !== expected.sourcePreviewArtifactHash ||
    binding.sourcePreviewEvidenceHash !== expected.sourcePreviewEvidenceHash ||
    binding.targetEnvironment !== "production" ||
    result.gitCommit !== expected.gitCommit ||
    result.orchestratorReference !== run.url
  ) {
    throw new Error(
      "Release evidence artifact does not match the dispatched candidate.",
    );
  }
  return result;
};

/** Pushes the exact candidate ref, waits for one workflow and returns its bound result. */
export const prepareGitHubReleaseCandidate = async (
  requestValue,
  options = {},
) => {
  const execute = options.execute || runCommand;
  const wait =
    options.wait ||
    ((milliseconds) =>
      new Promise((resolvePromise) =>
        setTimeout(resolvePromise, milliseconds),
      ));
  const request = parseGitHubReleaseRequest(
    requestValue,
    options.expectedRepositoryRoot || process.cwd(),
  );
  const config = readGitHubAdapterConfig(options.environment || process.env);
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "realize-release-"));
  try {
    const input = { config, request };
    const environment = commandEnvironment(config, temporaryRoot);
    await pushCandidateCommit(input, options.execute, temporaryRoot);
    const run = await waitForRun(input, execute, environment, wait);
    return await readEvidence(input, run, execute, environment, temporaryRoot);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
};
