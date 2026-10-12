/**
 * @file .ai/tools/git-delivery/src/merge/hashGitMergeCandidate.util.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Связывает check evidence с назначенными parents, candidate tree и точной областью изменений.
 */
import { createHash } from "node:crypto";
import type { GitMergeContext, GitMergeCommitBody } from "./GitMerge.types.ts";

/** Проверки относятся к tree и назначению; пути канонизируются, порядок parents сохраняется. */
export function hashGitMergeCandidate(
  context: Pick<
    GitMergeContext,
    "target" | "source" | "candidate" | "candidateSourceRoot"
  >,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        candidateSourceRoot: context.candidateSourceRoot,
        target: {
          connectionKey: context.target.connectionKey,
          connectionRevision: context.target.connectionRevision,
          repositorySlug: context.target.repositorySlug,
          repositoryID: context.target.repositoryID,
          ref: context.target.ref,
          oid: context.target.oid,
          treeOid: context.target.treeOid,
        },
        source: { ref: context.source.ref, oid: context.source.oid },
        candidate: {
          treeOid: context.candidate.treeOid,
          approvedChangedPaths: [
            ...context.candidate.approvedChangedPaths,
          ].sort(),
          files: [...context.candidate.files]
            .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
            .map((file) => ({
              path: file.path,
              mode: file.mode,
              blobOid: file.blobOid,
            })),
        },
      }),
    )
    .digest("hex");
}

/** Детерминированный unsigned Git object позволяет сверить неизвестный POST без второго create. */
export function hashGitMergeCommit(body: GitMergeCommitBody): string {
  const person = (value: GitMergeCommitBody["author"]) =>
    `${value.name} <${value.email}> ${Date.parse(value.date) / 1000} +0000`;
  const content = Buffer.from(
    `tree ${body.tree}\nparent ${body.parents[0]}\nparent ${body.parents[1]}\nauthor ${person(body.author)}\ncommitter ${person(body.committer)}\n\n${body.message}`,
  );
  return createHash("sha1")
    .update(`commit ${content.length}\0`)
    .update(content)
    .digest("hex");
}
