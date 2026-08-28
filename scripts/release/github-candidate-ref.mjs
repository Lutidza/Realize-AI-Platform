/**
 * @file scripts/release/github-candidate-ref.mjs
 * @version 2026-08-27
 * @docref ADR-0011
 * @see documentation/architecture/decisions/ADR-0011-github-ghcr-vps-release-preview.md
 * @description Publishes one exact local commit to the isolated release-candidate ref namespace.
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { candidateRef } from "./github-release-contract.mjs";

const repositoryFromRemote = (value) => {
  const source = value.trim().replace(/\.git$/iu, "");
  const prefixes = [
    "git@github.com:",
    "ssh://git@github.com/",
    "ssh://git@github.com:22/",
    "https://github.com/",
  ];
  const prefix = prefixes.find((candidate) =>
    source.toLowerCase().startsWith(candidate),
  );
  const repository = prefix ? source.slice(prefix.length) : "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("Git origin must be a credential-free GitHub repository.");
  }
  return repository;
};

/** Pushes a candidate ref without exposing the GitHub token to argv or Git hooks. */
export const pushCandidateCommit = async (input, execute, temporaryRoot) => {
  const remoteURL = `https://github.com/${input.config.repository}.git`;
  const reference = candidateRef(input.request.candidateKey);
  const askpass = resolve(temporaryRoot, "git-askpass.sh");
  await writeFile(
    askpass,
    "#!/bin/sh\ncase \"$1\" in\n  *Username*) printf '%s\\n' 'x-access-token' ;;\n  *Password*) printf '%s\\n' \"$REALIZE_AI_GITHUB_TOKEN\" ;;\n  *) exit 1 ;;\nesac\n",
    { mode: 0o700 },
  );
  const environment = {
    GIT_ASKPASS: askpass,
    GIT_ASKPASS_REQUIRE: "force",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C.UTF-8",
    REALIZE_AI_GITHUB_TOKEN: input.config.token,
  };
  const options = {
    cwd: input.request.repositoryRoot,
    env: environment,
    secrets: [input.config.token],
    timeoutMs: 120_000,
  };
  const origin = await execute(
    input.config.gitCommand,
    ["remote", "get-url", "--push", "origin"],
    { cwd: input.request.repositoryRoot, env: { LANG: "C.UTF-8" } },
  );
  if (
    repositoryFromRemote(origin.stdout).toLowerCase() !==
    input.config.repository.toLowerCase()
  ) {
    throw new Error("Configured GitHub repository differs from Git origin.");
  }
  const local = await execute(
    input.config.gitCommand,
    ["rev-parse", `${input.request.gitCommit}^{commit}`],
    { cwd: input.request.repositoryRoot, env: { LANG: "C.UTF-8" } },
  );
  if (local.stdout.trim() !== input.request.gitCommit) {
    throw new Error(
      "Candidate commit is not available in the trusted repository.",
    );
  }
  const remote = await execute(
    input.config.gitCommand,
    [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "credential.helper=",
      "-c",
      "http.proxy=",
      "ls-remote",
      "--refs",
      remoteURL,
      reference,
    ],
    options,
  );
  const remoteCommit = remote.stdout.trim().split(/\s+/)[0] || "";
  if (remoteCommit && remoteCommit !== input.request.gitCommit) {
    throw new Error("Candidate remote ref already points to another commit.");
  }
  if (!remoteCommit) {
    await execute(
      input.config.gitCommand,
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "credential.helper=",
        "-c",
        "http.proxy=",
        "push",
        remoteURL,
        `${input.request.gitCommit}:${reference}`,
      ],
      options,
    );
  }
};
