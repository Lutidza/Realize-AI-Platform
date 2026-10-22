/**
 * @file .ai/tools/git-delivery/src/push/runGitPush.service.ts
 * @version 1.1.1
 * @date 2026-10-22
 * @description Отправляет разрешённый набор коммитов в назначенную ветку с журналом и проверкой сетевого результата.
 */
import {
  PolicyError,
  acquireGitLock as acquireLock,
} from "@realize/git-runtime";

import { realpath } from "node:fs/promises";
import { emptyResult } from "../contracts.ts";
import { Git } from "@realize/git-runtime";
import { GitFailure } from "@realize/git-runtime";
import { GitJournalRepository } from "../GitJournal.repository.ts";

import type {
  GitNetworkConnection,
  GitNetworkSession,
} from "../network/GitNetwork.types.ts";
import type {
  GitPushContext,
  GitPushDependencies,
  GitPushJournal,
  GitPushResult,
  GitPushStage,
} from "./GitPush.types.ts";
import { validateGitPushContext } from "./validateGitPushContext.validator.ts";
import { GitPushSourceService } from "./GitPushSource.service.ts";
import { validateGitPushJournal } from "./validateGitPushJournal.validator.ts";
import { hashGitPushContext } from "./hashGitPushContext.util.ts";
import { createGitPushDiagnostic } from "./createGitPushDiagnostic.mapper.ts";
import { assertGitPushRecovery } from "./assertGitPushRecovery.validator.ts";

function requireConnection(
  connection: Awaited<ReturnType<GitPushDependencies["resolveConnection"]>>,
  context: GitPushContext,
): GitNetworkConnection {
  const target = context.target;
  if (connection.state !== "ready")
    throw new PolicyError(
      "connection_unavailable",
      "Подключение отсутствует или отключено.",
    );
  if (
    connection.connectionKey !== target.connectionKey ||
    connection.revision !== target.connectionRevision ||
    connection.repositorySlug !== target.repositorySlug ||
    connection.transport !== target.transport
  ) {
    throw new PolicyError(
      "connection_changed",
      "Подключение не соответствует разрешённому назначению.",
    );
  }
  return connection;
}

/** Сбой требует сверки; повторная запись возможна только по отдельному разрешению на следующую попытку. */
export async function runGitPush(
  input: unknown,
  dependencies: GitPushDependencies,
): Promise<GitPushResult> {
  const result: GitPushResult = {
    ...emptyResult(),
    action: "push",
    pushStatus: "not_attempted",
    remoteCommit: null,
  };
  let lock: Awaited<ReturnType<typeof acquireLock>> | undefined;
  let network: GitNetworkSession | undefined;
  let repository: GitJournalRepository | undefined;
  let journal: GitPushJournal | undefined;
  let sending = false;
  let stage: GitPushStage = "context";
  try {
    const context = validateGitPushContext(input);
    context.repositoryRoot = await realpath(context.repositoryRoot);
    result.requestId = context.requestId;
    result.branch = context.target.branch;
    result.commit = context.target.sourceOid;
    stage = "source";
    const git = new Git(context.repositoryRoot);
    const root = await realpath(
      (await git.run(["rev-parse", "--show-toplevel"])).trim(),
    );
    if (root !== context.repositoryRoot)
      throw new PolicyError(
        "worker_repository_mismatch",
        "Путь не является корнем рабочей копии.",
      );
    const common = await realpath(
      (
        await git.run([
          "rev-parse",
          "--path-format=absolute",
          "--git-common-dir",
        ])
      ).trim(),
    );
    lock = await acquireLock(common);
    git.attachLock(lock);
    const source = new GitPushSourceService(git, context);
    await source.assertReady();
    result.checks = context.verification.requiredChecks.map((id) => ({
      id,
      status: "passed",
      reused: true,
    }));
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
    journal = {
      version: 1,
      kind: "push",
      binding: hashGitPushContext(context),
      target: context.target,
      commits: context.authorization.scope.commits,
      phase: "prepared",
    };
    const stored = await repository.load();
    if (stored !== null) journal = validateGitPushJournal(stored, journal);
    result.recoveryAttempts = journal.recoveryAttempts ?? 0;
    if (["sending", "unknown"].includes(journal.phase))
      result.pushStatus = "unknown";
    if (context.recovery && stored === null) {
      throw new PolicyError(
        "push_recovery_unavailable",
        "Нет незавершённой отправки для восстановления.",
      );
    }
    stage = "connection";
    const connection = requireConnection(
      await dependencies.resolveConnection(),
      context,
    );
    network = await dependencies.createNetwork(git, connection, context.target);
    stage = "remote";
    result.remoteCommit = await network.readRemoteHead();
    if (result.remoteCommit === context.target.sourceOid) {
      journal.phase = "succeeded";
      delete journal.diagnostic;
      await repository.save(journal);
      result.status = "noop";
      result.pushStatus = "succeeded";
      result.summary =
        "Удалённая ветка уже содержит назначенный commit; повторная отправка не нужна.";
      return result;
    }
    if (journal.phase !== "prepared" && !context.recovery) {
      result.pushStatus = "unknown";
      throw new PolicyError(
        "push_outcome_unknown",
        "Предыдущая отправка не подтверждена; автоматическая повторная запись запрещена.",
      );
    }
    if (result.remoteCommit !== context.target.remoteOid)
      throw new PolicyError(
        "push_remote_changed",
        "Удалённая ветка отличается от разрешённой исходной версии.",
      );
    const recoveryAttempts = assertGitPushRecovery(
      journal,
      context.recovery,
      stored !== null,
    );
    stage = "prepare";
    await repository.save(journal);
    requireConnection(await dependencies.resolveConnection(), context);
    await source.recheck();
    lock.assertHeld();
    // Разрешение расходуется долговременно до сетевой записи: обрыв не даёт повторить тот же attempt.
    if (context.recovery) journal.recoveryAttempts = recoveryAttempts;
    journal.phase = "sending";
    await repository.save(journal);
    result.recoveryAttempts = journal.recoveryAttempts ?? 0;
    sending = true;
    stage = "push";
    // pre-push guard сверяет advertised old OID в реальном обмене и сохраняет штатный hook.
    await network.push();
    stage = "confirm";
    result.remoteCommit = await network.readRemoteHead();
    if (result.remoteCommit !== context.target.sourceOid)
      throw new PolicyError(
        "push_outcome_unknown",
        "Отправка завершилась без подтверждения назначенной удалённой версии.",
      );
    journal.phase = "succeeded";
    delete journal.diagnostic;
    await repository.save(journal);
    result.status = "succeeded";
    result.pushStatus = "succeeded";
    result.summary =
      "Назначенный набор коммитов опубликован в разрешённую ветку.";
  } catch (error) {
    result.diagnostic =
      !sending &&
      error instanceof PolicyError &&
      ["push_outcome_unknown", "push_recovery_invalid"].includes(error.code) &&
      journal?.diagnostic
        ? journal.diagnostic
        : createGitPushDiagnostic(error, stage);
    result.errorCode =
      error instanceof PolicyError || error instanceof GitFailure
        ? error.code
        : "push_failed";
    result.status = sending ? "partial" : "blocked";
    result.summary = sending
      ? "Результат отправки требует сверки удалённой ветки."
      : "Push остановлен до отправки.";
    if (sending) {
      result.pushStatus = "unknown";
      if (repository && journal) {
        journal.phase = "unknown";
        journal.diagnostic = result.diagnostic;
        try {
          await repository.save(journal);
        } catch {
          result.errorCode = "push_journal_failed";
        }
      }
    }
  } finally {
    try {
      await network?.close();
    } catch (error) {
      result.status = "failed";
      result.errorCode = "push_cleanup_failed";
      result.diagnostic = createGitPushDiagnostic(error, "cleanup");
    }
    try {
      await lock?.release();
    } catch (error) {
      result.status = "failed";
      result.errorCode = "push_cleanup_failed";
      result.diagnostic = createGitPushDiagnostic(error, "cleanup");
    }
  }
  return result;
}
