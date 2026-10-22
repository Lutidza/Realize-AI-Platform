/**
 * @file .ai/tools/git-delivery/src/sync/runGitSync.service.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Исполняет адресный fetch или чистый fast-forward pull с общей блокировкой, журналом и сверкой OID.
 */
import { acquireGitLock as acquireLock } from "@realize/git-runtime";

import { realpath } from "node:fs/promises";
import { emptyResult } from "../emptyResult.util.ts";
import { Git } from "@realize/git-runtime";
import { GitFailure } from "@realize/git-runtime";
import { GitJournalRepository } from "../GitJournal.repository.ts";
import { PolicyError } from "@realize/git-runtime";

import type {
  GitFetchNetworkSession,
  GitNetworkConnection,
} from "../network/GitNetwork.types.ts";
import type {
  GitSyncAction,
  GitSyncContext,
  GitSyncDependencies,
  GitSyncJournal,
  GitSyncResult,
  GitSyncStage,
} from "./GitSync.types.ts";
import { createGitSyncDiagnostic } from "./createGitSyncDiagnostic.mapper.ts";
import { GitSyncSourceService } from "./GitSyncSource.service.ts";
import {
  gitSyncTrackingRef,
  loadGitSyncJournal,
} from "./GitSyncJournal.service.ts";
import { validateGitSyncContext } from "./validateGitSyncContext.validator.ts";

function requireConnection(
  connection: Awaited<ReturnType<GitSyncDependencies["resolveConnection"]>>,
  context: GitSyncContext,
): GitNetworkConnection {
  if (connection.state !== "ready")
    throw new PolicyError(
      "connection_unavailable",
      "Подключение отсутствует или отключено.",
    );
  const target = context.target;
  if (
    connection.connectionKey !== target.connectionKey ||
    connection.revision !== target.connectionRevision ||
    connection.repositorySlug !== target.repositorySlug ||
    connection.transport !== target.transport
  )
    throw new PolicyError(
      "connection_changed",
      "Подключение отличается от разрешённого назначения.",
    );
  return connection;
}

async function readTracking(git: Git, ref: string): Promise<string | null> {
  try {
    return (
      await git.run(["rev-parse", "--verify", ref], { machineRead: true })
    ).trim();
  } catch (error) {
    if (
      error instanceof GitFailure &&
      error.code === "git_command_failed" &&
      error.exitCode === 128
    )
      return null;
    throw error;
  }
}

/** Повтор сверяет фактический ref/HEAD; fetch повторим только на тот же OID, pull никогда не откатывает локальные изменения. */
export async function runGitSync(
  action: GitSyncAction,
  input: unknown,
  dependencies: GitSyncDependencies,
): Promise<GitSyncResult> {
  const result: GitSyncResult = {
    ...emptyResult(),
    action,
    fetchedCommit: null,
    trackingRef: null,
    syncStatus: "not_attempted",
  };
  let stage: GitSyncStage = "context";
  let lock: Awaited<ReturnType<typeof acquireLock>> | undefined;
  let network: GitFetchNetworkSession | undefined;
  let repository: GitJournalRepository | undefined;
  let journal: GitSyncJournal | undefined;
  let mutated = false;
  try {
    const context = validateGitSyncContext(input, action);
    context.repositoryRoot = await realpath(context.repositoryRoot);
    result.requestId = context.requestId;
    result.branch = context.target.branch;
    result.commit = context.target.sourceOid;
    stage = "source";
    const git = new Git(context.repositoryRoot);
    const root = await realpath(
      (
        await git.run(["rev-parse", "--show-toplevel"], { machineRead: true })
      ).trim(),
    );
    if (root !== context.repositoryRoot)
      throw new PolicyError(
        "worker_repository_mismatch",
        "Назначенный путь не является корнем рабочей копии.",
      );
    const common = await realpath(
      (
        await git.run(
          ["rev-parse", "--path-format=absolute", "--git-common-dir"],
          { machineRead: true },
        )
      ).trim(),
    );
    lock = await acquireLock(common);
    git.attachLock(lock);
    const source = new GitSyncSourceService(git, context);
    stage = "journal";
    repository = new GitJournalRepository(context);
    try {
      await git.run([
        "--no-literal-pathspecs",
        "check-ignore",
        "-q",
        "--",
        repository.relativePath,
      ]);
    } catch {
      throw new PolicyError(
        "journal_not_ignored",
        "Журнал операции должен быть исключён из Git.",
      );
    }
    const observedOid = await readTracking(git, gitSyncTrackingRef(context));
    journal = await loadGitSyncJournal(
      action,
      context,
      repository,
      observedOid,
    );
    await git.run(["check-ref-format", journal.trackingRef]);
    let tracked = await readTracking(git, journal.trackingRef);
    if (tracked !== context.target.remoteOid && tracked !== journal.previousOid)
      throw new PolicyError(
        "sync_tracking_changed",
        "Служебный ref отличается от назначенного OID.",
      );
    stage = "source";
    const head = await source.readHead();
    const applied =
      action === "pull" &&
      head === context.target.remoteOid &&
      ["applying", "succeeded", "unknown"].includes(journal.phase);
    await source.assertReady(
      applied ? context.target.remoteOid : context.target.sourceOid,
    );
    if (journal.phase === "succeeded" || applied) {
      if (tracked !== null && tracked !== context.target.remoteOid)
        throw new PolicyError(
          "sync_recovery_mismatch",
          "Завершённая операция не владеет текущим значением tracking ref.",
        );
      if (action === "fetch" && tracked !== context.target.remoteOid)
        throw new PolicyError(
          "sync_recovery_mismatch",
          "Завершённый fetch не подтверждён tracking ref.",
        );
      if (action === "pull" && !applied)
        throw new PolicyError(
          "sync_recovery_mismatch",
          "Завершённый pull не подтверждён текущим HEAD.",
        );
      lock.assertHeld();
      journal.phase = "succeeded";
      await repository.save(journal);
      if (action === "pull" && tracked !== null) {
        await git.run([
          "update-ref",
          "-d",
          journal.trackingRef,
          context.target.remoteOid,
        ]);
        tracked = null;
      }
      result.status = "noop";
      result.syncStatus = "succeeded";
      result.commit = applied
        ? context.target.remoteOid
        : context.target.sourceOid;
      result.fetchedCommit = context.target.remoteOid;
      result.trackingRef = tracked ? journal.trackingRef : null;
      result.summary =
        "Назначенная синхронизация уже подтверждена; повторная запись не нужна.";
      return result;
    }
    stage = "connection";
    const connection = requireConnection(
      await dependencies.resolveConnection(),
      context,
    );
    network = await dependencies.createNetwork(git, connection, context.target);
    stage = "remote";
    if ((await network.readRemoteHead()) !== context.target.remoteOid)
      throw new PolicyError(
        "sync_remote_changed",
        "Удалённая ветка отличается от назначенного OID.",
      );
    requireConnection(await dependencies.resolveConnection(), context);
    await source.assertReady();
    lock.assertHeld();
    if (tracked !== context.target.remoteOid) {
      stage = "fetch";
      journal.phase = "fetching";
      await repository.save(journal);
      mutated = true;
      await network.fetch(journal.trackingRef, journal.previousOid);
      tracked = await readTracking(git, journal.trackingRef);
      if (tracked !== context.target.remoteOid)
        throw new PolicyError(
          "sync_fetched_mismatch",
          "Fetch не подтвердил назначенный OID в tracking ref.",
        );
    }
    result.trackingRef = journal.trackingRef;
    result.fetchedCommit = tracked;
    stage = "confirm";
    if ((await network.readRemoteHead()) !== context.target.remoteOid)
      throw new PolicyError(
        "sync_remote_changed",
        "Удалённая ветка изменилась во время fetch.",
      );
    const type = (
      await git.run(["cat-file", "-t", context.target.remoteOid], {
        machineRead: true,
      })
    ).trim();
    if (type !== "commit")
      throw new PolicyError(
        "sync_fetched_mismatch",
        "Назначенный объект не является commit.",
      );
    journal.phase = "fetched";
    await repository.save(journal);
    if (action === "pull") {
      stage = "apply";
      await source.assertNoIncomingGitlinks();
      await source.assertFastForward();
      await source.assertReady();
      requireConnection(await dependencies.resolveConnection(), context);
      if ((await network.readRemoteHead()) !== context.target.remoteOid)
        throw new PolicyError(
          "sync_remote_changed",
          "Удалённая ветка изменилась перед pull.",
        );
      lock.assertHeld();
      journal.phase = "applying";
      await repository.save(journal);
      mutated = true;
      // Единственный режим применения: точный OID, fast-forward, без autostash и создания merge commit.
      await git.run([
        "--no-replace-objects",
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "submodule.recurse=false",
        "-c",
        "merge.autoStash=false",
        "merge",
        "--ff-only",
        "--no-edit",
        "--no-autostash",
        "--no-overwrite-ignore",
        "--no-stat",
        context.target.remoteOid,
      ]);
      await source.assertReady(context.target.remoteOid);
      result.commit = context.target.remoteOid;
    } else {
      await source.assertReady();
    }
    lock.assertHeld();
    journal.phase = "succeeded";
    await repository.save(journal);
    if (action === "pull") {
      await git.run([
        "update-ref",
        "-d",
        journal.trackingRef,
        context.target.remoteOid,
      ]);
      result.trackingRef = null;
    }
    result.status =
      action === "pull" && context.target.sourceOid === context.target.remoteOid
        ? "noop"
        : "succeeded";
    result.syncStatus = "succeeded";
    result.summary =
      action === "fetch"
        ? "Назначенный commit получен в изолированный tracking ref."
        : "Рабочая копия обновлена fast-forward до назначенного commit.";
  } catch (error) {
    result.diagnostic = createGitSyncDiagnostic(error, stage);
    result.errorCode =
      error instanceof PolicyError || error instanceof GitFailure
        ? error.code
        : "sync_failed";
    result.status = mutated ? "partial" : "blocked";
    result.syncStatus = mutated ? "unknown" : "not_attempted";
    result.summary = mutated
      ? "Синхронизация требует сверки служебного ref и HEAD."
      : "Синхронизация остановлена до изменения Git.";
    if (mutated && journal && repository && journal.phase !== "succeeded") {
      journal.phase = "unknown";
      try {
        await repository.save(journal);
      } catch {
        result.errorCode = "sync_journal_failed";
      }
    }
  } finally {
    try {
      await network?.close();
    } catch (error) {
      result.status = "failed";
      result.errorCode = "sync_cleanup_failed";
      result.diagnostic = createGitSyncDiagnostic(error, "cleanup");
    }
    try {
      await lock?.release();
    } catch (error) {
      result.status = "failed";
      result.errorCode = "sync_cleanup_failed";
      result.diagnostic = createGitSyncDiagnostic(error, "cleanup");
    }
  }
  return result;
}
