/**
 * @file services/ai-execution-worker/src/commitPromotion.service.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Повторно проверяет принятый artifact и создаёт один commit с явной служебной identity.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Git, withGitRepositoryLock } from "@realize/git-runtime";
import { WorktreePolicyError } from "./WorktreePolicy.error";
import { readVerifiedPromotionDiff } from "./readVerifiedPromotionDiff.service";
import type { PromotionCommit } from "./previewTypes";
import type { PromotionArtifactInput } from "./WorkerWorktree.types";

const identity = {
  GIT_AUTHOR_NAME: "Realize AI Preview Service",
  GIT_AUTHOR_EMAIL: "preview-service@realize.invalid",
  GIT_COMMITTER_NAME: "Realize AI Preview Service",
  GIT_COMMITTER_EMAIL: "preview-service@realize.invalid",
};

/** Build и review завершены до reacquire; checked diff и commit используют один живой lease. */
export const commitPromotion = async (
  input: PromotionArtifactInput,
): Promise<PromotionCommit> => {
  const buildID = (
    await readFile(resolve(input.workspace, ".next/BUILD_ID"), "utf8")
  ).trim();
  if (!buildID)
    throw new WorktreePolicyError("Verified build output has no BUILD_ID.");
  return withGitRepositoryLock(
    { repositoryRoot: input.workspace, existingLease: input.existingLease },
    async (lease) => {
      const git = new Git(input.workspace, { profile: "service" });
      git.attachLock(lease);
      try {
        await readVerifiedPromotionDiff({ ...input, existingLease: lease });
        const stagedTree = (await git.run(["write-tree"])).trim();
        await git.run(
          [
            "commit",
            "--no-gpg-sign",
            "--no-verify",
            "-m",
            "chore(ai): preview change " + input.job.changeRequestID,
          ],
          { env: identity },
        );
        const [commitSHA, treeHash, parent, status] = await Promise.all([
          git.run(["rev-parse", "HEAD"]),
          git.run(["rev-parse", "HEAD^{tree}"]),
          git.run(["rev-parse", "HEAD^"]),
          git.run(["status", "--porcelain", "--untracked-files=no"]),
        ]);
        if (
          parent.trim() !== input.job.baseCommit ||
          treeHash.trim() !== stagedTree ||
          status.trim()
        )
          throw new WorktreePolicyError(
            "Created commit does not match the verified staged tree.",
          );
        const normalizedCommit = commitSHA.trim();
        const normalizedTree = treeHash.trim();
        return {
          artifactHash: createHash("sha256")
            .update(
              JSON.stringify([
                "local-git-preview",
                normalizedCommit,
                normalizedTree,
                input.job.sourceDiffHash,
                buildID,
              ]),
            )
            .digest("hex"),
          commitSHA: normalizedCommit,
          treeHash: normalizedTree,
        };
      } finally {
        git.detachLock();
      }
    },
  );
};
