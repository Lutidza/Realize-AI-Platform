/**
 * @file .ai/tools/git-delivery/src/handler.ts
 * @version 1.0.1
 * @date 2026-09-09
 * @description Локальные inspect/commit: доверенная область, привязанные проверки и повтор по журналу ADR-0016.
 */
import { createHash } from "node:crypto";
import { realpath, lstat } from "node:fs/promises";
import { join } from "node:path";
import {
  emptyResult,
  parseCommand,
  parseContext,
  PolicyError,
} from "./contracts.ts";
import type { Command, Context, Result } from "./contracts.ts";
import { Git, GitFailure } from "./Git.adapter.ts";
import { inspectRepository } from "./repository.ts";
import type { Snapshot } from "./repository.ts";
import {
  acquireLock,
  journalRelativePath,
  loadJournal,
  saveJournal,
} from "./state.ts";
import type { Journal } from "./state.ts";
import { assertIndexScope, validateChanges, verifyStaged } from "./safety.ts";

const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalizedMessage = (value: string): string =>
  value.replace(/\n*$/, "") + "\n";

function binding(command: Command, context: Context): string {
  return hash({
    command,
    ...context,
    verification: context.verification && {
      inputPaths: context.verification.inputPaths,
      requiredChecks: context.verification.requiredChecks,
    },
  });
}

function reportSnapshot(result: Result, snapshot: Snapshot): void {
  result.branch = snapshot.branch;
  result.commit = snapshot.head;
  result.fingerprint = snapshot.fingerprint;
  const items = [];
  let bytes = 0;
  for (const item of snapshot.changes) {
    bytes += Buffer.byteLength(JSON.stringify(item));
    if (items.length === 200 || bytes > 32 * 1024) break;
    items.push(item);
  }
  result.changes = {
    items,
    truncated: items.length !== snapshot.changes.length,
  };
}

function verifyEvidence(
  context: Context,
  fingerprint: string,
  result: Result,
): void {
  const verification = context.verification;
  if (!verification?.requiredChecks.length)
    throw new PolicyError(
      "checks_required",
      "Нужны выполненные проверки из доверенного контекста.",
    );
  for (const id of verification.requiredChecks) {
    const check = verification.results.find((item) => item.id === id);
    if (
      !check ||
      check.status !== "passed" ||
      check.fingerprint !== fingerprint
    ) {
      throw new PolicyError(
        "checks_stale_or_missing",
        "Обязательная проверка отсутствует, не пройдена или относится к другому снимку.",
      );
    }
    result.checks.push({ id, status: "passed", reused: true });
  }
}

async function assertNoOperation(snapshot: Snapshot): Promise<void> {
  for (const filename of [
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "rebase-merge",
    "rebase-apply",
    "sequencer",
    "BISECT_LOG",
  ]) {
    const exists = await lstat(join(snapshot.gitDir, filename)).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false;
        throw error;
      },
    );
    if (exists)
      throw new PolicyError(
        "operation_in_progress",
        "В рабочей копии уже выполняется отдельная Git-операция.",
      );
  }
}

async function frozenSnapshot(
  git: Git,
  context: Context,
  journal: Journal,
): Promise<Snapshot> {
  const current = await inspectRepository(
    git,
    context.authorization.scope,
    journal.original.files.map((file) => file.path),
  );
  if (
    current.head !== journal.original.head ||
    current.branch !== journal.original.branch ||
    JSON.stringify(current.files) !== JSON.stringify(journal.original.files)
  ) {
    throw new PolicyError(
      "repository_changed",
      "Ветка, содержимое или входы проверок изменились после подготовки операции.",
    );
  }
  return current;
}

async function verifyCommit(
  git: Git,
  oid: string,
  command: Command,
  context: Context,
  journal: Journal,
): Promise<void> {
  const branch = (await git.run(["symbolic-ref", "--quiet", "HEAD"])).replace(
    /\n$/,
    "",
  );
  if (branch !== `refs/heads/${journal.original.branch}`) {
    throw new PolicyError(
      "commit_mismatch",
      "Ветка после попытки commit отличается от исходной.",
    );
  }
  const raw = await git.run(["cat-file", "commit", oid]);
  const divider = raw.indexOf("\n\n");
  const headers = raw.slice(0, divider).split("\n");
  const parents = headers.filter((line) => line.startsWith("parent "));
  const author = headers.find((line) => line.startsWith("author "));
  const committer = headers.find((line) => line.startsWith("committer "));
  const identity = `${context.identity!.name} <${context.identity!.email}> `;
  if (
    divider < 0 ||
    !headers.includes(`tree ${journal.preparedTree}`) ||
    parents.length !== 1 ||
    parents[0] !== `parent ${journal.original.head}` ||
    !author?.startsWith(`author ${identity}`) ||
    !committer?.startsWith(`committer ${identity}`) ||
    normalizedMessage(raw.slice(divider + 2)) !==
      normalizedMessage(command.message!)
  ) {
    throw new PolicyError(
      "commit_mismatch",
      "Созданный commit отличается от подготовленной операции; автоматический повтор остановлен.",
    );
  }
}

export async function runDelivery(
  input: unknown,
  trustedContext: unknown,
): Promise<Result> {
  const result = emptyResult();
  let context: Context | undefined;
  let git: Git | undefined;
  let lock: Awaited<ReturnType<typeof acquireLock>> | undefined;
  let journal: Journal | null = null;
  let mutated = false;
  let commitAttempted = false;
  try {
    const command = parseCommand(input);
    result.action = command.action;
    result.pushStatus = command.action.includes("push")
      ? "not_attempted"
      : "not_requested";
    context = parseContext(trustedContext);
    result.requestId = context.requestId;
    if (!context.authorization.actions.includes(command.action)) {
      throw new PolicyError(
        "action_not_authorized",
        "Действие отсутствует в разрешении запуска.",
      );
    }
    if (command.action === "push" || command.action === "commit_push") {
      throw new PolicyError(
        "network_delivery_unavailable",
        "HTTPS/SSH доставка ещё не подключена; Git-состояние не изменено.",
      );
    }
    context.repositoryRoot = await realpath(context.repositoryRoot);
    git = new Git(context.repositoryRoot);
    const commonDir = await realpath(
      (
        await git.run([
          "rev-parse",
          "--path-format=absolute",
          "--git-common-dir",
        ])
      ).replace(/\n$/, ""),
    );
    lock = await acquireLock(commonDir);
    git.lockDescriptor = lock.descriptor;
    const snapshot = await inspectRepository(
      git,
      context.authorization.scope,
      context.verification?.inputPaths ?? [],
    );
    if (snapshot.commonDir !== commonDir)
      throw new PolicyError(
        "repository_changed",
        "Рабочая копия сменилась во время запуска.",
      );
    reportSnapshot(result, snapshot);
    if (command.action === "inspect") {
      result.status = "succeeded";
      result.summary = "Состояние прочитано без изменения индекса и файлов.";
      return result;
    }
    if (!command.message)
      throw new PolicyError(
        "message_required",
        "Воркер должен передать текст commit.",
      );
    if (!context.identity)
      throw new PolicyError(
        "identity_required",
        "Авторство должно поступить из доверенного контекста.",
      );
    if (!snapshot.head || !snapshot.branch)
      throw new PolicyError(
        "branch_required",
        "Локальный commit требует ветку с существующим HEAD.",
      );
    await assertNoOperation(snapshot);
    // Журнал обязан быть ignored до создания каталогов, включая scope=all.
    try {
      await git.run([
        "--no-literal-pathspecs",
        "check-ignore",
        "-q",
        "--",
        journalRelativePath(context),
      ]);
    } catch {
      throw new PolicyError(
        "journal_not_ignored",
        "Каталог журнала должен быть исключён из Git.",
      );
    }
    journal = await loadJournal(context);
    const operationBinding = binding(command, context);
    if (journal) {
      if (
        journal.binding !== operationBinding ||
        journal.original.root !== snapshot.root ||
        journal.original.gitDir !== snapshot.gitDir ||
        journal.original.commonDir !== snapshot.commonDir
      ) {
        throw new PolicyError(
          "request_conflict",
          "Этот requestId уже связан с другим заданием.",
        );
      }
      const scope = context.authorization.scope;
      if (
        scope.mode === "paths" &&
        journal.paths.some((path) => !scope.paths.includes(path))
      ) {
        throw new PolicyError(
          "request_conflict",
          "Состав журнала выходит за разрешённую область.",
        );
      }
      validateChanges(journal.original);
      if (journal.noop) {
        reportSnapshot(result, journal.original);
        result.status = "noop";
        result.summary =
          "Операция ранее завершена без изменений; новые правки в неё не включены.";
        return result;
      }
      if (journal.original.branch !== snapshot.branch)
        throw new PolicyError(
          "repository_changed",
          "Ветка операции изменилась.",
        );
      if (journal.commit || snapshot.head !== journal.original.head) {
        const candidate = journal.commit ?? snapshot.head;
        if (!journal.preparedTree || candidate !== snapshot.head) {
          throw new PolicyError(
            "recovery_conflict",
            "HEAD не соответствует журналу; нужен разбор фактического состояния.",
          );
        }
        await verifyCommit(git, candidate, command, context, journal);
        journal.commit = candidate;
        reportSnapshot(result, journal.original);
        result.commit = candidate;
        result.commitCreated = true;
        result.status = "noop";
        result.summary =
          "Commit этой операции уже существует; повторный commit не создан.";
        journal.result = result;
        await saveJournal(context, journal);
        return result;
      }
      verifyEvidence(context, journal.original.fingerprint, result);
      await frozenSnapshot(git, context, journal);
      await assertIndexScope(git, journal.paths);
    } else {
      const paths = validateChanges(snapshot);
      await assertIndexScope(git, paths);
      if (!paths.length) {
        result.status = "noop";
        result.summary = "В разрешённой области нет изменений.";
        journal = {
          version: 1,
          binding: operationBinding,
          original: snapshot,
          paths,
          noop: true,
          result,
        };
        await saveJournal(context, journal);
        return result;
      }
      verifyEvidence(context, snapshot.fingerprint, result);
      journal = {
        version: 1,
        binding: operationBinding,
        original: snapshot,
        paths,
      };
      const before = await frozenSnapshot(git, context, journal);
      if (before.indexHash !== snapshot.indexHash)
        throw new PolicyError(
          "repository_changed",
          "Индекс изменился после проверки.",
        );
      await saveJournal(context, journal);
    }
    lock.assertHeld();
    if (!journal.preparedTree) {
      const beforeStaging = await frozenSnapshot(git, context, journal);
      let alreadyStaged = false;
      if (beforeStaging.indexHash !== journal.original.indexHash) {
        try {
          await verifyStaged(git, journal.original, journal.paths);
          alreadyStaged = true;
        } catch {
          throw new PolicyError(
            "index_changed",
            "После подготовки операции индекс изменён; новый staged-состав сохранён.",
          );
        }
      }
      mutated = true;
      if (!alreadyStaged) {
        await git.run(
          ["add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"],
          { input: journal.paths.join("\0") + "\0" },
        );
      }
      await frozenSnapshot(git, context, journal);
      await verifyStaged(git, journal.original, journal.paths);
      journal.preparedTree = (await git.run(["write-tree"])).trim();
      await saveJournal(context, journal);
    } else {
      await verifyStaged(git, journal.original, journal.paths);
      if ((await git.run(["write-tree"])).trim() !== journal.preparedTree) {
        throw new PolicyError(
          "index_changed",
          "Подготовленное дерево индекса изменилось.",
        );
      }
    }
    await frozenSnapshot(git, context, journal);
    await assertNoOperation(journal.original);
    await assertIndexScope(git, journal.paths, true);
    if ((await git.run(["write-tree"])).trim() !== journal.preparedTree) {
      throw new PolicyError(
        "index_changed",
        "Перед commit индекс отличается от подготовленного дерева.",
      );
    }
    lock.assertHeld();
    const { name, email } = context.identity;
    mutated = true;
    commitAttempted = true;
    await git.run(["commit", "--file=-", "--cleanup=verbatim"], {
      input: command.message,
      env: {
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: name,
        GIT_COMMITTER_EMAIL: email,
      },
    });
    const head = (await git.run(["rev-parse", "--verify", "HEAD"])).trim();
    result.commit = head;
    result.commitCreated = head !== journal.original.head;
    await verifyCommit(git, head, command, context, journal);
    journal.commit = head;
    result.status = "succeeded";
    result.summary =
      "Локальный commit создан и сверён с подготовленным деревом.";
    journal.result = result;
    await saveJournal(context, journal);
  } catch (error) {
    let unknownCommit = false;
    if (commitAttempted && git && journal) {
      try {
        const head = (await git.run(["rev-parse", "--verify", "HEAD"])).trim();
        result.commit = head;
        result.commitCreated = head !== journal.original.head;
      } catch {
        unknownCommit = true;
        result.commit = null;
        result.commitCreated = null;
      }
    }
    const known = error instanceof PolicyError || error instanceof GitFailure;
    result.status = mutated ? "partial" : known ? "blocked" : "failed";
    result.errorCode = known ? error.code : "local_io_failed";
    result.summary = known
      ? error.message
      : "Не удалось завершить локальную операцию; подробности окружения не включены в отчёт.";
    if (unknownCommit) {
      result.errorCode = "commit_state_unknown";
      result.summary =
        "Не удалось установить результат commit; повтор должен сначала сверить журнал и фактический HEAD.";
    }
    result.retryable = [
      "repository_locked",
      "git_timeout",
      "git_start_failed",
    ].includes(result.errorCode);
    if (mutated && journal && context) {
      journal.result = result;
      await saveJournal(context, journal).catch(() => {});
    }
  } finally {
    if (git) git.lockDescriptor = undefined;
    await lock?.release().catch(() => {});
  }
  return result;
}
