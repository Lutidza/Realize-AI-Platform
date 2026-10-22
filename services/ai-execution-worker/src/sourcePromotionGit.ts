/**
 * @file services/ai-execution-worker/src/sourcePromotionGit.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Создаёт scoped GitHub branch с exact commit через общий Git engine и CAS отсутствующей ref.
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 */
import {
  Git,
  buildCreateOnlyGitPushArguments,
  createGitAskpass,
  withGitRepositoryLock,
} from "@realize/git-runtime";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { SourcePromotionGitPolicyError } from "./SourcePromotionGitPolicy.error";
import type { SourcePromotionGitInput } from "./SourcePromotionGit.types";

const repositoryFromRemote = (value: string): string => {
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
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    throw new SourcePromotionGitPolicyError(
      "Git origin must be a credential-free GitHub repository.",
    );
  return repository;
};

/** Не меняет approval/evidence: повторно сверяет origin/commit/ref внутри lease и ограниченной сетевой фазы. */
export const publishExactGitHubBranch = async (
  input: SourcePromotionGitInput,
): Promise<void> => {
  if (
    !/^[a-f0-9]{40}$/.test(input.gitCommit) ||
    !/^ai\/changes\/[A-Za-z0-9_-]+-[a-f0-9]{12}$/.test(input.headBranch) ||
    !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(input.repositorySlug)
  )
    throw new SourcePromotionGitPolicyError(
      "Source promotion binding is invalid.",
    );
  const temporaryRoot = await mkdtemp(
    resolve(tmpdir(), "realize-source-promotion-"),
  );
  try {
    const askpassPath = await createGitAskpass(temporaryRoot);
    const signal = AbortSignal.timeout(input.timeoutMs);
    await withGitRepositoryLock(
      {
        repositoryRoot: input.repositoryRoot,
        command: input.gitCommand,
        signal,
      },
      async (lease) => {
        const git = new Git(input.repositoryRoot, {
          profile: "service",
          command: input.gitCommand,
          timeoutMs: input.timeoutMs,
          maxOutputBytes: 64 * 1024,
        });
        git.attachLock(lease);
        try {
          const [origin, local] = await Promise.all([
            git.run(["remote", "get-url", "--push", "origin"], { signal }),
            git.run(["rev-parse", input.gitCommit + "^{commit}"], { signal }),
          ]);
          if (
            repositoryFromRemote(origin).toLowerCase() !==
            input.repositorySlug.toLowerCase()
          )
            throw new SourcePromotionGitPolicyError(
              "Configured GitHub repository differs from Git origin.",
            );
          if (local.trim() !== input.gitCommit)
            throw new SourcePromotionGitPolicyError(
              "Preview commit is not available in the trusted repository.",
            );
          const remoteURL =
            "https://github.com/" + input.repositorySlug + ".git";
          const reference = "refs/heads/" + input.headBranch;
          const options = {
            signal,
            network: {
              transport: "https" as const,
              askpassPath,
              token: input.token,
            },
          };
          const readRemote = async (): Promise<string> => {
            const remote = await git.run(
              ["ls-remote", "--refs", remoteURL, reference],
              options,
            );
            return remote.trim().split(/\s+/)[0] || "";
          };
          const remoteCommit = await readRemote();
          if (remoteCommit && remoteCommit !== input.gitCommit)
            throw new SourcePromotionGitPolicyError(
              "Source promotion branch already points to another commit.",
            );
          if (!remoteCommit)
            await git.run(
              buildCreateOnlyGitPushArguments({
                remoteURL,
                reference,
                commit: input.gitCommit,
              }),
              options,
            );
          if ((await readRemote()) !== input.gitCommit)
            throw new SourcePromotionGitPolicyError(
              "Published GitHub branch does not resolve to the exact preview commit.",
            );
        } finally {
          git.detachLock();
        }
      },
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
};
