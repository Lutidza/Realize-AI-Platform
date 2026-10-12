/**
 * @file .ai/tools/git-delivery/src/manage/runGitManage.service.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Координирует одну разрешённую локальную Git-операцию с блокировкой и безопасным replay.
 */
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { Git, GitFailure } from "../Git.adapter.ts";
import { acquireGitLock } from "../acquireGitLock.adapter.ts";
import { GitJournalRepository } from "../GitJournal.repository.ts";
import type { GitLock } from "../GitLock.types.ts";
import { emptyResult } from "../emptyResult.util.ts";
import { PolicyError } from "../Policy.error.ts";
import type {
  GitManageContext,
  GitManageJournal,
  GitManageResult,
  GitManageState,
} from "./GitManage.types.ts";
import { readGitManagement } from "./readGitManagement.adapter.ts";
import { assertGitManageLocalObjects } from "./assertGitManageLocalObjects.adapter.ts";
import {
  assertGitManageClean,
  readGitManageHead,
  readGitManageState,
} from "./readGitManageState.adapter.ts";
import {
  isGitManageWrite,
  validateGitManageContext,
} from "./validateGitManageContext.validator.ts";
import { validateGitManageJournal } from "./validateGitManageJournal.validator.ts";
import {
  expectedGitManageAfter,
  writeGitManagement,
} from "./writeGitManagement.adapter.ts";

const equal = (a: GitManageState, b: GitManageState) =>
  JSON.stringify(a) === JSON.stringify(b);
function assertExpected(
  context: GitManageContext,
  current: GitManageState,
): void {
  if (
    context.expected &&
    (context.expected.head !== current.head ||
      context.expected.branch !== current.branch)
  )
    throw new PolicyError(
      "manage_repository_changed",
      "HEAD или ветка не совпадают с разрешённым снимком.",
    );
}

/** Контекст поступает от caller; модель вызывает capability без параметров и не задаёт Git arguments. */
export async function runGitManage(input: unknown): Promise<GitManageResult> {
  const result: GitManageResult = { ...emptyResult(), action: "manage" };
  let git: Git | undefined;
  let lock: GitLock | undefined;
  let attempted = false;
  try {
    const context = validateGitManageContext(input);
    result.requestId = context.requestId;
    if ((await realpath(context.repositoryRoot)) !== context.repositoryRoot)
      throw new PolicyError(
        "manage_repository_invalid",
        "Корень репозитория должен быть canonical path без symlink.",
      );
    git = new Git(context.repositoryRoot, { maxOutputBytes: 2 * 1024 * 1024 });
    const top = (
      await git.run(["rev-parse", "--show-toplevel"], { machineRead: true })
    ).trim();
    if ((await realpath(top)) !== context.repositoryRoot)
      throw new PolicyError(
        "manage_repository_invalid",
        "Разрешённый корень не является корнем рабочей копии.",
      );
    const directory = async (flag: string) =>
      realpath(
        (
          await git!.run(["rev-parse", "--path-format=absolute", flag], {
            machineRead: true,
          })
        ).trim(),
      );
    const commonDir = await directory("--git-common-dir");
    const gitDir = await directory("--git-dir");
    lock = await acquireGitLock(commonDir);
    git.lockDescriptor = lock.descriptor;
    if (
      (await directory("--git-common-dir")) !== commonDir ||
      (await directory("--git-dir")) !== gitDir
    )
      throw new PolicyError(
        "manage_repository_changed",
        "Рабочая копия сменилась во время запуска.",
      );
    if (context.operation.kind === "worktree-repair" && gitDir !== commonDir)
      throw new PolicyError(
        "manage_worktree_invalid",
        "Repair выполняется из основной рабочей копии.",
      );
    await assertGitManageLocalObjects(git, context.operation);
    let current = await readGitManageState(git, context, commonDir);
    result.branch = current.branch;
    result.commit = current.head;
    if (!isGitManageWrite(context.operation)) {
      assertExpected(context, current);
      result.details = await readGitManagement(git, context.operation);
      if (!equal(current, await readGitManageState(git, context, commonDir)))
        throw new PolicyError(
          "manage_repository_changed",
          "Репозиторий изменился во время чтения.",
        );
      result.status = "succeeded";
      result.summary = "Разрешённые локальные Git-данные прочитаны.";
      return result;
    }
    const storage = new GitJournalRepository(context);
    try {
      await git.run([
        "--no-literal-pathspecs",
        "check-ignore",
        "-q",
        "--",
        storage.relativePath,
      ]);
    } catch {
      throw new PolicyError(
        "journal_not_ignored",
        "Каталог журнала должен быть исключён из Git.",
      );
    }
    const binding = createHash("sha256")
      .update(JSON.stringify(context))
      .digest("hex");
    const stored = await storage.load();
    let journal: GitManageJournal;
    if (stored !== null) {
      journal = validateGitManageJournal(stored);
      if (journal.binding !== binding)
        throw new PolicyError(
          "request_conflict",
          "requestId уже связан с другим разрешением.",
        );
      assertExpected(context, journal.before);
      if (
        !equal(
          journal.after,
          expectedGitManageAfter(context, journal.before, commonDir),
        )
      )
        throw new PolicyError(
          "invalid_journal",
          "Журнал назначает непредусмотренную цель.",
        );
      if (equal(current, journal.after)) {
        journal.phase = "completed";
        await storage.save(journal);
        result.details = await readGitManagement(git, context.operation);
        result.status = "noop";
        result.summary =
          "Операция уже завершена; повторное изменение не выполнено.";
        return result;
      }
      if (journal.phase === "completed" || !equal(current, journal.before))
        throw new PolicyError(
          "manage_recovery_conflict",
          "Фактическое состояние расходится с журналом; нужен отдельный разбор.",
        );
    } else {
      assertExpected(context, current);
      journal = {
        version: 1,
        kind: "manage",
        binding,
        phase: "prepared",
        before: current,
        after: expectedGitManageAfter(context, current, commonDir),
      };
    }
    if (
      context.operation.kind === "branch-create" ||
      context.operation.kind === "branch-switch"
    )
      await assertGitManageClean(git, gitDir);
    current = await readGitManageState(git, context, commonDir);
    if (!equal(current, journal.before))
      throw new PolicyError(
        "manage_repository_changed",
        "Цель изменилась до mutation.",
      );
    await storage.save(journal);
    lock.assertHeld();
    if (!equal(journal.before, journal.after)) {
      attempted = true;
      await writeGitManagement(git, context);
    }
    current = await readGitManageState(git, context, commonDir);
    if (!equal(current, journal.after))
      throw new PolicyError(
        "manage_result_unknown",
        "Git не подтвердил разрешённый результат; повтор сначала сверяет журнал.",
      );
    journal.phase = "completed";
    await storage.save(journal);
    result.branch = current.branch;
    result.commit = current.head;
    result.details = await readGitManagement(git, context.operation);
    result.status = attempted ? "succeeded" : "noop";
    result.summary = attempted
      ? "Разрешённое локальное изменение Git выполнено и сверено."
      : "Целевое состояние уже установлено.";
  } catch (error) {
    delete result.details;
    if (attempted && git) {
      try {
        const current = await readGitManageHead(git);
        result.branch = current.branch;
        result.commit = current.head;
      } catch {
        result.branch = null;
        result.commit = null;
      }
    }
    const known = error instanceof PolicyError || error instanceof GitFailure;
    result.status = attempted ? "partial" : known ? "blocked" : "failed";
    result.errorCode = known ? error.code : "manage_io_failed";
    result.summary = known
      ? error.message
      : "Локальную Git-операцию не удалось завершить; закрытые данные окружения не включены в результат.";
    result.retryable = [
      "repository_locked",
      "git_timeout",
      "git_start_failed",
    ].includes(result.errorCode);
  } finally {
    if (git) git.lockDescriptor = undefined;
    await lock?.release().catch(() => {});
  }
  return result;
}
