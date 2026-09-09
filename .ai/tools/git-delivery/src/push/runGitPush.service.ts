/**
 * @file .ai/tools/git-delivery/src/push/runGitPush.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отправляет разрешённый набор коммитов в назначенную ветку с журналом и проверкой сетевого результата.
 */

import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { emptyResult, PolicyError } from "../contracts.ts";
import { Git } from "../Git.adapter.ts";
import { GitFailure } from "../GitFailure.error.ts";
import { GitJournalRepository } from "../GitJournal.repository.ts";
import { acquireLock } from "../state.ts";
import type {
  GitNetworkConnection,
  GitNetworkSession,
} from "../network/GitNetwork.types.ts";
import type {
  GitPushContext,
  GitPushDependencies,
  GitPushJournal,
  GitPushResult,
} from "./GitPush.types.ts";
import { validateGitPushContext } from "./validateGitPushContext.validator.ts";
import { GitPushSourceService } from "./GitPushSource.service.ts";
import { validateGitPushJournal } from "./validateGitPushJournal.validator.ts";

const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

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

/** Сбой после начала отправки требует чтения назначения; повтор не отправляет неизвестную операцию вслепую. */
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
  try {
    const context = validateGitPushContext(input);
    context.repositoryRoot = await realpath(context.repositoryRoot);
    result.requestId = context.requestId;
    result.branch = context.target.branch;
    result.commit = context.target.sourceOid;
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
    git.lockDescriptor = lock.descriptor;
    const source = new GitPushSourceService(git, context);
    await source.assertReady();
    result.checks = context.verification.requiredChecks.map((id) => ({
      id,
      status: "passed",
      reused: true,
    }));
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
      binding: hash(context),
      target: context.target,
      commits: context.authorization.scope.commits,
      phase: "prepared",
    };
    const stored = await repository.load();
    if (stored !== null) journal = validateGitPushJournal(stored, journal);
    const connection = requireConnection(
      await dependencies.resolveConnection(),
      context,
    );
    network = await dependencies.createNetwork(git, connection, context.target);
    result.remoteCommit = await network.readRemoteHead();
    if (result.remoteCommit === context.target.sourceOid) {
      journal.phase = "succeeded";
      await repository.save(journal);
      result.status = "noop";
      result.pushStatus = "succeeded";
      result.summary =
        "Удалённая ветка уже содержит назначенный commit; повторная отправка не нужна.";
      return result;
    }
    if (journal.phase !== "prepared") {
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
    await repository.save(journal);
    requireConnection(await dependencies.resolveConnection(), context);
    await source.recheck();
    lock.assertHeld();
    journal.phase = "sending";
    await repository.save(journal);
    sending = true;
    // pre-push guard сверяет advertised old OID в реальном обмене и сохраняет штатный hook.
    await network.push();
    result.remoteCommit = await network.readRemoteHead();
    if (result.remoteCommit !== context.target.sourceOid)
      throw new PolicyError(
        "push_outcome_unknown",
        "Отправка завершилась без подтверждения назначенной удалённой версии.",
      );
    journal.phase = "succeeded";
    await repository.save(journal);
    result.status = "succeeded";
    result.pushStatus = "succeeded";
    result.summary =
      "Назначенный набор коммитов опубликован в разрешённую ветку.";
  } catch (error) {
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
    } catch {
      result.status = "failed";
      result.errorCode = "push_cleanup_failed";
    }
    try {
      await lock?.release();
    } catch {
      result.status = "failed";
      result.errorCode = "push_cleanup_failed";
    }
  }
  return result;
}
