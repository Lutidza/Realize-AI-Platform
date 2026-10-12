/**
 * @file .ai/tools/git-delivery/src/merge/publishGitMergeTree.service.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Публикует только проверенные immutable blobs/tree с журналом каждого object POST и без повторов неизвестного исхода.
 */
import { PolicyError } from "../Policy.error.ts";
import type { GitJournalRepository } from "../GitJournal.repository.ts";
import type {
  GitMergeContext,
  GitMergeJournal,
  GitMergeRemote,
  GitMergeTree,
  GitMergeCandidateBytes,
} from "./GitMerge.types.ts";
import { validateGitMergeTrees } from "./validateGitMergeTrees.validator.ts";

/** beforeMutation сохраняет привязку к refs/connection; bytes уже прочитаны и проверены целиком до вызова. */
export async function publishGitMergeTree(
  context: GitMergeContext,
  target: GitMergeTree,
  files: GitMergeCandidateBytes[],
  journal: GitMergeJournal,
  storage: GitJournalRepository,
  remote: GitMergeRemote,
  beforeMutation: () => Promise<void>,
  attempted: () => void,
): Promise<void> {
  const unknown = (): never => {
    throw new PolicyError(
      "merge_upload_unknown",
      "Исход immutable object POST не подтверждён; повторная запись того же объекта не выполняется.",
    );
  };
  if (journal.pendingObject) {
    const pending = journal.pendingObject;
    if (pending.kind === "blob") {
      if (!(await remote.hasBlob(pending.oid))) unknown();
      if (!journal.uploadedBlobs.includes(pending.oid))
        journal.uploadedBlobs.push(pending.oid);
    } else {
      const tree = await remote.readTree(pending.oid);
      if (!tree) return unknown();
      validateGitMergeTrees(context, target, tree);
    }
    delete journal.pendingObject;
    delete journal.uncertainStage;
    journal.phase = "uploading";
    await storage.save(journal);
  }
  const existing = await remote.readTree(context.candidate.treeOid);
  if (existing) {
    validateGitMergeTrees(context, target, existing);
    journal.phase = "uploaded";
    delete journal.uncertainStage;
    await storage.save(journal);
    return;
  }
  if (journal.phase === "unknown" && journal.uncertainStage === "uploading") {
    delete journal.uncertainStage;
    journal.phase = "uploading";
  }
  journal.phase = "uploading";
  await storage.save(journal);
  for (const file of files) {
    if (file.blobOid === null || journal.uploadedBlobs.includes(file.blobOid))
      continue;
    if (!(await remote.hasBlob(file.blobOid))) {
      await beforeMutation();
      journal.pendingObject = { kind: "blob", oid: file.blobOid };
      await storage.save(journal);
      attempted();
      if ((await remote.createBlob(file.bytes!)) !== file.blobOid)
        throw new PolicyError(
          "merge_blob_mismatch",
          "GitHub создал другой blob SHA1.",
        );
    }
    journal.uploadedBlobs.push(file.blobOid);
    delete journal.pendingObject;
    await storage.save(journal);
  }
  await beforeMutation();
  journal.pendingObject = { kind: "tree", oid: context.candidate.treeOid };
  await storage.save(journal);
  attempted();
  if (
    (await remote.createTree(
      context.target.treeOid,
      context.candidate.files,
    )) !== context.candidate.treeOid
  )
    throw new PolicyError(
      "merge_tree_mismatch",
      "GitHub tree SHA1 не совпадает с проверенным candidate.",
    );
  const published = await remote.readTree(context.candidate.treeOid);
  if (!published) return unknown();
  validateGitMergeTrees(context, target, published);
  journal.phase = "uploaded";
  delete journal.pendingObject;
  delete journal.uncertainStage;
  await storage.save(journal);
}
