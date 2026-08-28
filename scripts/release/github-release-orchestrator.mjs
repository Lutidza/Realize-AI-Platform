#!/usr/bin/env node
/**
 * @file scripts/release/github-release-orchestrator.mjs
 * @version 2026-08-27
 * @docref ADR-0011
 * @see documentation/architecture/decisions/ADR-0011-github-ghcr-vps-release-preview.md
 * @description Implements the worker JSON stdin/stdout port through GitHub Actions and GHCR.
 */

import { pathToFileURL } from "node:url";

import { prepareGitHubReleaseCandidate } from "./github-actions-adapter.mjs";

const maximumInputBytes = 64 * 1024;

/** Reads exactly one bounded JSON request from stdin. */
export const readReleaseRequest = async (stream = process.stdin) => {
  let source = "";
  for await (const chunk of stream) {
    source += chunk.toString("utf8");
    if (Buffer.byteLength(source, "utf8") > maximumInputBytes) {
      throw new Error("Release request exceeded the input limit.");
    }
  }
  try {
    return JSON.parse(source);
  } catch {
    throw new Error("Release request must contain one JSON object.");
  }
};

/** Runs the executable boundary without writing diagnostics to stdout. */
export const runGitHubReleaseOrchestrator = async () => {
  const result = await prepareGitHubReleaseCandidate(
    await readReleaseRequest(),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

const isEntrypoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runGitHubReleaseOrchestrator().catch((error) => {
    const message = error instanceof Error ? error.message : "unknown error";
    process.stderr.write(`[github-release-orchestrator] ${message}\n`);
    process.exitCode = 1;
  });
}
