/**
 * @file .ai/tools/git-delivery/src/merge/runGitMerge.service.ts
 * @version 1.0.2
 * @date 2026-10-22
 * @description Создаёт verified approved-tree commit с двумя parents и продвигает только назначенный GitHub ref.
 * @see documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md
 */
import { createHash } from "node:crypto";
import { GitFailure } from "@realize/git-runtime";
import { GitJournalRepository } from "../GitJournal.repository.ts";
import { openGitMergeSource } from "./openGitMergeSource.adapter.ts";
import type { GitMergeLocalSource } from "./GitMerge.types.ts";
import { readGitMergeCandidate } from "./readGitMergeCandidate.adapter.ts";
import { hashGitTree, applyGitTreeChanges } from "./hashGitTree.util.ts";
import { publishGitMergeTree } from "./publishGitMergeTree.service.ts";
import { emptyResult } from "../emptyResult.util.ts";
import { PolicyError } from "@realize/git-runtime";
import { validateGitMergeContext } from "./validateGitMergeContext.validator.ts";
import { validateGitMergeTrees } from "./validateGitMergeTrees.validator.ts";
import { validateGitMergeJournal } from "./validateGitMergeJournal.validator.ts";
import {
  hashGitMergeCandidate,
  hashGitMergeCommit,
} from "./hashGitMergeCandidate.util.ts";
import type {
  GitMergeCommit,
  GitMergeContext,
  GitMergeDependencies,
  GitMergeJournal,
  GitMergeResult,
} from "./GitMerge.types.ts";

function assertCommit(
  commit: GitMergeCommit | null,
  journal: GitMergeJournal,
): void {
  const body = journal.body;
  if (
    !commit ||
    commit.sha !== journal.expectedCommit ||
    commit.treeOid !== body.tree ||
    JSON.stringify(commit.parents) !== JSON.stringify(body.parents) ||
    (commit.message !== body.message &&
      commit.message + "\n" !== body.message) ||
    ["author", "committer"].some((key) => {
      const selected = key as "author" | "committer";
      return (
        commit[selected].name !== body[selected].name ||
        commit[selected].email !== body[selected].email ||
        Date.parse(commit[selected].date) !== Date.parse(body[selected].date)
      );
    })
  )
    throw new PolicyError(
      "merge_commit_mismatch",
      "GitHub commit не совпадает с точными tree, parents и frozen identity/message.",
    );
}

/** Модель лишь запускает назначенную операцию; неизвестный create/update сначала сверяется без повторной mutation. */
export async function runGitMerge(
  input: unknown,
  dependencies: GitMergeDependencies,
): Promise<GitMergeResult> {
  const result: GitMergeResult = {
    ...emptyResult(),
    action: "merge",
    mergedTree: null,
    remoteCommit: null,
    mergeStatus: "not_attempted",
  };
  let local: GitMergeLocalSource | undefined;
  let journal: GitMergeJournal | undefined;
  let storage: GitJournalRepository | undefined;
  let attempted = false;
  try {
    const context: GitMergeContext = validateGitMergeContext(input);
    result.requestId = context.requestId;
    result.branch = context.target.ref.slice(11);
    result.fingerprint = hashGitMergeCandidate(context);
    local = await openGitMergeSource(context);
    storage = local.storage;
    const binding = createHash("sha256")
      .update(JSON.stringify(context))
      .digest("hex");
    const stored = await storage.load();
    if (stored !== null)
      journal = validateGitMergeJournal(stored, context, binding);
    const connection = async () => {
      const value = await dependencies.resolveConnection();
      if (
        value.state !== "ready" ||
        value.revision !== context.target.connectionRevision ||
        value.repositorySlug !== context.target.repositorySlug
      )
        throw new PolicyError(
          "merge_connection_changed",
          "Primary GitHub connection не совпадает с назначенной ревизией/repository.",
        );
      return value;
    };
    const remote = dependencies.createRemote(await connection());
    const repository = await remote.readRepository();
    if (
      repository.id !== context.target.repositoryID ||
      repository.fullName.toLowerCase() !==
        context.target.repositorySlug.toLowerCase()
    )
      throw new PolicyError(
        "merge_repository_changed",
        "GitHub repository identity изменилась.",
      );
    result.remoteCommit = await remote.readRef(context.target.ref);
    if (journal && result.remoteCommit === journal.expectedCommit) {
      assertCommit(await remote.readCommit(journal.expectedCommit), journal);
      journal.phase = "completed";
      delete journal.uncertainStage;
      await storage.save(journal);
      result.commit = journal.expectedCommit;
      result.mergedTree = context.candidate.treeOid;
      result.mergeStatus = "succeeded";
      result.status = "noop";
      result.summary =
        "Назначенный merge уже опубликован; повторная запись не выполнялась.";
      return result;
    }
    if (
      result.remoteCommit !== context.target.oid ||
      (await remote.readRef(context.source.ref)) !== context.source.oid
    )
      throw new PolicyError(
        "merge_remote_source_changed",
        "Remote target/source ref изменился после приёмки candidate.",
      );
    if (
      (journal && ["completed", "updating"].includes(journal.phase)) ||
      (journal?.phase === "unknown" && journal.uncertainStage === "updating")
    ) {
      result.mergeStatus = "unknown";
      throw new PolicyError(
        "merge_update_unknown",
        "Исход прежнего ref update не подтверждён; новая запись не разрешена автоматически.",
      );
    }
    await local.assertReady();
    const targetCommit = await remote.readCommit(context.target.oid);
    const sourceCommit = await remote.readCommit(context.source.oid);
    if (
      !targetCommit ||
      targetCommit.sha !== context.target.oid ||
      targetCommit.treeOid !== context.target.treeOid ||
      !sourceCommit ||
      sourceCommit.sha !== context.source.oid
    )
      throw new PolicyError(
        "merge_parent_mismatch",
        "Immutable parent commits не совпадают с назначенным target/source.",
      );
    const targetTree = await remote.readTree(context.target.treeOid);
    if (
      !targetTree ||
      targetTree.truncated !== false ||
      hashGitTree(targetTree.tree) !== context.target.treeOid
    )
      throw new PolicyError(
        "merge_tree_incomplete",
        "Полный target tree не подтверждает исходный SHA1.",
      );
    const candidateBytes = await readGitMergeCandidate(context);
    const candidateEntries = applyGitTreeChanges(
      targetTree.tree,
      context.candidate.files,
    );
    if (hashGitTree(candidateEntries) !== context.candidate.treeOid)
      throw new PolicyError(
        "merge_candidate_tree_changed",
        "Candidate file hashes не дают проверенный full tree SHA1.",
      );
    validateGitMergeTrees(context, targetTree, {
      sha: context.candidate.treeOid,
      truncated: false,
      tree: candidateEntries,
    });
    if (!journal) {
      const date = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      const body = {
        message: context.message.endsWith("\n")
          ? context.message
          : context.message + "\n",
        tree: context.candidate.treeOid,
        parents: [context.target.oid, context.source.oid] as [string, string],
        author: { ...context.identity, date },
        committer: { ...context.identity, date },
      };
      journal = {
        version: 1,
        kind: "merge",
        binding,
        phase: "prepared",
        body,
        expectedCommit: hashGitMergeCommit(body),
        uploadedBlobs: [],
      };
      await storage.save(journal);
    }
    const beforeMutation = async () => {
      await local!.assertReady();
      await connection();
      local!.assertHeld();
      if (
        (await remote.readRef(context.target.ref)) !== context.target.oid ||
        (await remote.readRef(context.source.ref)) !== context.source.oid
      )
        throw new PolicyError(
          "merge_remote_source_changed",
          "Назначенные refs изменились до mutation.",
        );
    };
    if (
      ["prepared", "uploading"].includes(journal.phase) ||
      (journal.phase === "unknown" && journal.uncertainStage === "uploading")
    )
      await publishGitMergeTree(
        context,
        targetTree,
        candidateBytes,
        journal,
        storage,
        remote,
        beforeMutation,
        () => {
          attempted = true;
        },
      );
    if (
      journal.phase === "creating" ||
      (journal.phase === "unknown" && journal.uncertainStage === "creating")
    ) {
      const existing = await remote.readCommit(journal.expectedCommit);
      if (!existing) {
        result.mergeStatus = "unknown";
        throw new PolicyError(
          "merge_create_unknown",
          "Исход прежнего POST не подтверждён; второй create не выполняется.",
        );
      }
      assertCommit(existing, journal);
      journal.phase = "created";
      delete journal.uncertainStage;
      await storage.save(journal);
    }
    if (journal.phase === "uploaded") {
      await local.assertReady();
      await connection();
      local.assertHeld();
      if (
        (await remote.readRef(context.target.ref)) !== context.target.oid ||
        (await remote.readRef(context.source.ref)) !== context.source.oid
      )
        throw new PolicyError(
          "merge_remote_source_changed",
          "Refs изменились до create commit.",
        );
      journal.phase = "creating";
      await storage.save(journal);
      attempted = true;
      assertCommit(await remote.createCommit(journal.body), journal);
      journal.phase = "created";
      await storage.save(journal);
      result.commitCreated = true;
    }
    assertCommit(await remote.readCommit(journal.expectedCommit), journal);
    await local.assertReady();
    await connection();
    local.assertHeld();
    if (
      (await remote.readRef(context.target.ref)) !== context.target.oid ||
      (await remote.readRef(context.source.ref)) !== context.source.oid
    )
      throw new PolicyError(
        "merge_remote_source_changed",
        "Refs изменились до разрешённого FF ref update.",
      );
    journal.phase = "updating";
    await storage.save(journal);
    attempted = true;
    if (
      (await remote.updateRef(context.target.ref, journal.expectedCommit)) !==
      journal.expectedCommit
    )
      throw new PolicyError(
        "merge_update_mismatch",
        "GitHub не подтвердил назначенный ref update.",
      );
    result.remoteCommit = await remote.readRef(context.target.ref);
    if (
      result.remoteCommit !== journal.expectedCommit ||
      (await remote.readRef(context.source.ref)) !== context.source.oid
    )
      throw new PolicyError(
        "merge_update_mismatch",
        "Remote refs расходятся с результатом операции.",
      );
    journal.phase = "completed";
    await storage.save(journal);
    result.commit = journal.expectedCommit;
    result.mergedTree = context.candidate.treeOid;
    result.mergeStatus = "succeeded";
    result.status = "succeeded";
    result.checks = context.verification.requiredChecks.map((id) => ({
      id,
      status: "passed",
      reused: true,
    }));
    result.changes.items = context.candidate.approvedChangedPaths.map(
      (path) => ({ path, status: "approved" }),
    );
    result.summary =
      "Проверенный candidate tree опубликован merge commit с двумя закреплёнными parents; локальная копия не обновлялась.";
  } catch (error) {
    if (
      journal &&
      storage &&
      ["uploading", "creating", "updating"].includes(journal.phase)
    ) {
      journal.uncertainStage = journal.phase as
        "uploading" | "creating" | "updating";
      journal.phase = "unknown";
      result.mergeStatus = "unknown";
      await storage.save(journal).catch(() => {});
    }
    if (journal?.phase === "unknown") result.mergeStatus = "unknown";
    const known = error instanceof PolicyError || error instanceof GitFailure;
    result.status = attempted ? "partial" : known ? "blocked" : "failed";
    result.errorCode = known ? error.code : "merge_operation_failed";
    result.summary =
      "Approved-tree merge не завершён; прежде продолжения требуется сверка точного назначения и журнала.";
    if (journal?.phase === "created") result.commit = journal.expectedCommit;
  } finally {
    await local?.close().catch(() => {});
  }
  return result;
}
