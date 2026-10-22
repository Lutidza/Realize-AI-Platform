/**
 * @file scripts/release/github-candidate-ref.mjs
 * @version 1.0.0
 * @date 2026-10-22
 * @docref ADR-0011
 * @see documentation/architecture/decisions/ADR-0011-github-ghcr-vps-release-preview.md
 * @description Публикует точный commit в release-candidate ref через общий Git-исполнитель.
 */

import {
  Git,
  buildCreateOnlyGitPushArguments,
  createGitAskpass,
  withGitRepositoryLock,
} from "@realize/git-runtime";

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

/** Публикация удерживает общий lock только во время сверки и отправки Git ref. */
export const pushCandidateCommit = async (input, execute, temporaryRoot) => {
  const signal = AbortSignal.timeout(120_000);
  return withGitRepositoryLock(
    {
      repositoryRoot: input.request.repositoryRoot,
      command: input.config.gitCommand,
      signal,
    },
    async (lease) => {
      const git = new Git(input.request.repositoryRoot, {
        profile: "service",
        command: input.config.gitCommand,
        timeoutMs: 120_000,
        maxOutputBytes: 64 * 1024,
      });
      git.attachLock(lease);
      const remoteURL = `https://github.com/${input.config.repository}.git`;
      const reference = candidateRef(input.request.candidateKey);
      const network = {
        transport: "https",
        askpassPath: await createGitAskpass(temporaryRoot),
        token: input.config.token,
      };
      // Test port подменяет transport; production всегда использует общий process owner.
      const run = async (args, authenticated = false) =>
        execute
          ? (
              await execute(input.config.gitCommand, args, {
                cwd: input.request.repositoryRoot,
                timeoutMs: 120_000,
              })
            ).stdout
          : git.run(args, { signal, ...(authenticated ? { network } : {}) });
      try {
        const origin = await run(["remote", "get-url", "--push", "origin"]);
        if (
          repositoryFromRemote(origin).toLowerCase() !==
          input.config.repository.toLowerCase()
        ) {
          throw new Error(
            "Configured GitHub repository differs from Git origin.",
          );
        }
        const local = await run([
          "rev-parse",
          `${input.request.gitCommit}^{commit}`,
        ]);
        if (local.trim() !== input.request.gitCommit) {
          throw new Error(
            "Candidate commit is not available in the trusted repository.",
          );
        }
        const readRemote = async () => {
          const output = await run(
            ["ls-remote", "--refs", remoteURL, reference],
            true,
          );
          const entries = output.trim().split("\n").filter(Boolean);
          if (entries.length > 1)
            throw new Error("Candidate remote ref is ambiguous.");
          if (!entries.length) return null;
          const [oid, ref] = entries[0].split(/\s+/);
          if (!/^[a-f0-9]{40,64}$/.test(oid) || ref !== reference) {
            throw new Error("Candidate remote ref is invalid.");
          }
          return oid;
        };
        const remoteCommit = await readRemote();
        if (remoteCommit && remoteCommit !== input.request.gitCommit) {
          throw new Error(
            "Candidate remote ref already points to another commit.",
          );
        }
        if (!remoteCommit) {
          await run(
            buildCreateOnlyGitPushArguments({
              remoteURL,
              reference,
              commit: input.request.gitCommit,
            }),
            true,
          );
        }
        if ((await readRemote()) !== input.request.gitCommit) {
          throw new Error(
            "Candidate remote ref publication was not confirmed.",
          );
        }
      } finally {
        git.detachLock();
      }
    },
  );
};
