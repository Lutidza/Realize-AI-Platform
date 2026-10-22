/**
 * @file packages/git-runtime/src/buildCreateOnlyGitPushArguments.policy.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Строит атомарный publish новой ветки с обязательным отсутствием remote ref.
 */
import { GitFailure } from "./GitFailure.error.ts";
import type { CreateOnlyGitPushInput } from "./CreateOnlyGitPush.types.ts";

/** Пустой expected value — compare-and-swap отсутствия; существующая ветка никогда не заменяется. */
export function buildCreateOnlyGitPushArguments(
  input: CreateOnlyGitPushInput,
): string[] {
  const { remoteURL, reference, commit } = input;
  let remote: URL;
  try {
    remote = new URL(remoteURL);
  } catch {
    throw new GitFailure(
      "git_publish_arguments_invalid",
      "Недопустимое назначение публикации Git.",
    );
  }
  if (
    remote.protocol !== "https:" ||
    remote.username ||
    remote.password ||
    remote.search ||
    remote.hash ||
    remote.href !== remoteURL ||
    !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/u.test(remote.pathname) ||
    !/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/u.test(reference) ||
    reference.includes("..") ||
    reference
      .split("/")
      .some(
        (part) =>
          !part ||
          part.startsWith(".") ||
          part.endsWith(".") ||
          part.endsWith(".lock"),
      ) ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(commit) ||
    /^0+$/u.test(commit)
  ) {
    throw new GitFailure(
      "git_publish_arguments_invalid",
      "Недопустимые аргументы create-only публикации Git.",
    );
  }
  return [
    "push",
    "--porcelain",
    `--force-with-lease=${reference}:`,
    "--no-follow-tags",
    "--recurse-submodules=no",
    "--",
    remoteURL,
    `${commit}:${reference}`,
  ];
}
