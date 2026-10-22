/**
 * @file packages/git-runtime/src/GitExecutionProfile.policy.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Определяет изменяющие команды и запрещает переопределение выбранного Git owner.
 */
import { GitFailure } from "./GitFailure.error.ts";

/** Разбирает только глобальные параметры программно составленного вызова. */
export function gitCommandOffset(args: readonly string[]): number {
  let index = 0;
  while (args[index]?.startsWith("-")) {
    const option = args[index];
    if (option === "-c") {
      const configuration = args[index + 1];
      if (
        !configuration ||
        !configuration.includes("=") ||
        /^(?:core\.(?:worktree|bare)|include(?:if\.[^=]+)?\.path)=/iu.test(
          configuration,
        )
      )
        throw new GitFailure(
          "git_arguments_invalid",
          "Недопустимая конфигурация Git owner.",
        );
      index += 2;
    } else if (
      [
        "--literal-pathspecs",
        "--no-literal-pathspecs",
        "--no-pager",
        "--no-replace-objects",
      ].includes(option)
    ) {
      index++;
    } else {
      throw new GitFailure(
        "git_arguments_invalid",
        "Глобальный параметр Git не разрешён.",
      );
    }
  }
  if (!args[index])
    throw new GitFailure("git_arguments_invalid", "Команда Git отсутствует.");
  return index;
}

/** Неизвестная команда никогда не получает режим чтения по умолчанию. */
export function requiresGitLock(args: readonly string[]): boolean {
  const index = gitCommandOffset(args);
  const command = args[index];
  const rest = args.slice(index + 1);
  if (
    [
      "version",
      "rev-parse",
      "rev-list",
      "ls-files",
      "ls-tree",
      "cat-file",
      "diff",
      "log",
      "show",
      "status",
      "for-each-ref",
      "show-ref",
      "describe",
      "check-ignore",
      "check-ref-format",
      "ls-remote",
      "merge-base",
    ].includes(command)
  )
    return (
      ["diff", "log", "show"].includes(command) &&
      rest.some((part) =>
        /^--o(?:u(?:t(?:p(?:u(?:t)?)?)?)?)?(?:=|$)/u.test(part),
      )
    );
  if (command === "config") {
    const readModes = [
      "--get",
      "--get-all",
      "--get-regexp",
      "--get-urlmatch",
      "--list",
      "-l",
      "--get-color",
      "--get-colorbool",
    ];
    const safeOptions = [
      ...readModes,
      "--null",
      "-z",
      "--local",
      "--global",
      "--system",
      "--worktree",
      "--show-origin",
      "--show-scope",
      "--name-only",
      "--includes",
      "--no-includes",
      "--file",
      "-f",
      "--type",
      "--bool",
      "--int",
      "--bool-or-int",
      "--path",
      "--expiry-date",
      "--default",
    ];
    return (
      !rest.some((part) => readModes.includes(part)) ||
      rest.some(
        (part) =>
          part.startsWith("-") &&
          !safeOptions.includes(part) &&
          !/^(?:--file|--type|--default)=/u.test(part),
      )
    );
  }
  if (command === "remote") return rest.length !== 0 && rest[0] !== "get-url";
  if (command === "worktree") return rest[0] !== "list";
  if (command === "branch") {
    const readOptions = [
      "--list",
      "--show-current",
      "-a",
      "--all",
      "-r",
      "--remotes",
      "--contains",
      "--no-contains",
      "--merged",
      "--no-merged",
      "--points-at",
      "--format",
      "--sort",
      "--no-color",
      "--verbose",
      "-v",
      "-vv",
    ];
    return (
      rest.some(
        (part) =>
          part.startsWith("-") &&
          !readOptions.includes(part) &&
          !/^(?:--contains|--no-contains|--merged|--no-merged|--points-at|--format|--sort)=/u.test(
            part,
          ),
      ) ||
      (!rest.some((part) =>
        ["--list", "--show-current", "-a", "--all", "-r", "--remotes"].includes(
          part,
        ),
      ) &&
        rest.length !== 0)
    );
  }
  if (command === "symbolic-ref")
    return (
      rest.some(
        (part) =>
          part.startsWith("-") &&
          !["--quiet", "-q", "--short", "--no-recurse", "--recurse"].includes(
            part,
          ),
      ) || rest.filter((part) => !part.startsWith("-")).length !== 1
    );
  if (command === "hash-object")
    return rest.some((part) => /^-[^-]*w/u.test(part));
  if (command === "apply") return true;
  return true;
}

/** Machine clients получают только фиксированные формы чтения без executable filters и output files. */
export function assertMachineReadArguments(args: readonly string[]): void {
  const command = args[0];
  const reject = () => {
    throw new GitFailure(
      "git_arguments_invalid",
      "Параметры не разрешены машинному чтению.",
    );
  };
  if (
    ![
      "rev-parse",
      "symbolic-ref",
      "ls-tree",
      "ls-files",
      "cat-file",
      "diff",
    ].includes(command)
  )
    reject();
  const separator = args.indexOf("--");
  const options = args.slice(1, separator === -1 ? undefined : separator);
  const allowFlags = (allowed: readonly string[]) => {
    if (
      options.some(
        (argument) => argument.startsWith("-") && !allowed.includes(argument),
      )
    )
      reject();
  };
  if (command === "rev-parse")
    allowFlags([
      "--show-toplevel",
      "--show-object-format",
      "--git-common-dir",
      "--git-dir",
      "--absolute-git-dir",
      "--path-format=absolute",
      "--path-format=relative",
      "--git-path",
      "--verify",
      "--quiet",
      "--is-inside-work-tree",
      "--is-bare-repository",
      "--is-shallow-repository",
      "--show-prefix",
      "--show-cdup",
      "--end-of-options",
    ]);
  if (command === "ls-tree")
    allowFlags([
      "-r",
      "-t",
      "-d",
      "-z",
      "--full-tree",
      "--full-name",
      "--name-only",
      "--name-status",
      "--long",
      "-l",
      "--abbrev=40",
      "--abbrev=64",
    ]);
  if (command === "ls-files")
    allowFlags([
      "--stage",
      "--cached",
      "--others",
      "--exclude-standard",
      "--modified",
      "--deleted",
      "--unmerged",
      "--full-name",
      "-z",
      "-s",
      "-c",
      "-o",
      "-m",
      "-d",
      "-u",
      "-v",
    ]);
  if (command === "symbolic-ref") {
    allowFlags(["--quiet", "-q", "--short", "--no-recurse", "--recurse"]);
    if (
      separator !== -1 ||
      options.filter((argument) => !argument.startsWith("-")).length !== 1
    )
      reject();
  }
  if (command === "cat-file") {
    if (
      args.length !== 3 ||
      !["-t", "-s", "-p", "-e", "blob", "tree", "commit", "tag"].includes(
        args[1],
      )
    )
      reject();
  }
  if (command === "diff") {
    const safe = new Set([
      "--no-index",
      "--cached",
      "--staged",
      "--name-only",
      "--name-status",
      "--raw",
      "--numstat",
      "--stat",
      "--shortstat",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--no-renames",
      "--binary",
      "--full-index",
      "--exit-code",
      "--quiet",
      "--check",
      "-z",
    ]);
    for (const argument of options) {
      if (argument === "--") break;
      if (
        argument.startsWith("-") &&
        !safe.has(argument) &&
        !/^(?:--unified=|-U)\d+$/u.test(argument)
      )
        reject();
    }
    // Обязательные flags нельзя переопределить повторным executable option.
    if (
      !options.includes("--no-ext-diff") ||
      !options.includes("--no-textconv")
    )
      reject();
  }
}
