/**
 * @file .ai/tools/git-delivery/src/merge/validateGitMergeJournal.validator.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Отклоняет журнал, изменяющий назначение, identity, message или детерминированный commit object.
 */
import { PolicyError } from "@realize/git-runtime";
import { hashGitMergeCommit } from "./hashGitMergeCandidate.util.ts";
import type { GitMergeContext, GitMergeJournal } from "./GitMerge.types.ts";

/** Journal не назначает новую операцию; UTCdate фиксируется до POST и сохраняется при любом повторе. */
export function validateGitMergeJournal(
  input: unknown,
  context: GitMergeContext,
  binding: string,
): GitMergeJournal {
  const invalid = (): never => {
    throw new PolicyError(
      "merge_journal_invalid",
      "Журнал merge не соответствует исходному контексту.",
    );
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const journal = input as GitMergeJournal;
  if (
    Object.keys(journal).some(
      (key) =>
        ![
          "version",
          "kind",
          "binding",
          "phase",
          "body",
          "expectedCommit",
          "uncertainStage",
          "uploadedBlobs",
          "pendingObject",
        ].includes(key),
    ) ||
    journal.version !== 1 ||
    journal.kind !== "merge" ||
    journal.binding !== binding ||
    ![
      "prepared",
      "uploading",
      "uploaded",
      "creating",
      "created",
      "updating",
      "completed",
      "unknown",
    ].includes(journal.phase)
  )
    invalid();
  if (
    journal.phase === "unknown"
      ? !["uploading", "creating", "updating"].includes(
          journal.uncertainStage ?? "",
        )
      : journal.uncertainStage !== undefined
  )
    invalid();
  const acceptedBlobs = new Set(
    context.candidate.files
      .map((file) => file.blobOid)
      .filter((value): value is string => value !== null),
  );
  if (
    !Array.isArray(journal.uploadedBlobs) ||
    new Set(journal.uploadedBlobs).size !== journal.uploadedBlobs.length ||
    journal.uploadedBlobs.some((oid) => !acceptedBlobs.has(oid))
  )
    invalid();
  if (journal.pendingObject) {
    if (
      !(
        journal.phase === "uploading" ||
        (journal.phase === "unknown" && journal.uncertainStage === "uploading")
      ) ||
      Object.keys(journal.pendingObject).some(
        (key) => !["kind", "oid"].includes(key),
      ) ||
      (journal.pendingObject.kind === "blob"
        ? !acceptedBlobs.has(journal.pendingObject.oid)
        : journal.pendingObject.kind !== "tree" ||
          journal.pendingObject.oid !== context.candidate.treeOid)
    )
      invalid();
  }
  const body = journal.body;
  if (
    !body ||
    typeof body !== "object" ||
    Object.keys(body).some(
      (key) =>
        !["message", "tree", "parents", "author", "committer"].includes(key),
    ) ||
    body.tree !== context.candidate.treeOid ||
    body.message !==
      (context.message.endsWith("\n")
        ? context.message
        : context.message + "\n") ||
    !Array.isArray(body.parents) ||
    JSON.stringify(body.parents) !==
      JSON.stringify([context.target.oid, context.source.oid])
  )
    invalid();
  for (const person of [body.author, body.committer]) {
    if (
      !person ||
      typeof person !== "object" ||
      Object.keys(person).some(
        (key) => !["name", "email", "date"].includes(key),
      ) ||
      person.name !== context.identity.name ||
      person.email !== context.identity.email ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(person.date) ||
      !Number.isFinite(Date.parse(person.date)) ||
      new Date(person.date).toISOString().replace(/\.\d{3}Z$/, "Z") !==
        person.date
    )
      invalid();
  }
  if (
    body.author.date !== body.committer.date ||
    journal.expectedCommit !== hashGitMergeCommit(body)
  )
    invalid();
  return structuredClone(journal);
}
