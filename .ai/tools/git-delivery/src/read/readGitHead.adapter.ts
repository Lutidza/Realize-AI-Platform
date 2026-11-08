/**
 * @file .ai/tools/git-delivery/src/read/readGitHead.adapter.ts
 * @version 1.0.2
 * @date 2026-11-05
 * @description Читает HEAD и ветку без индекса, обхода и содержимого рабочего дерева.
 * @see documentation/specifications/internal-mcp.md
 */
import { Git, GitFailure } from "@realize/git-runtime";
import { RepositoryReadError } from "../../../../../services/ai-control-plane/src/RepositoryRead.error";
import { openRepositoryDirectory } from "../../../../../services/ai-control-plane/src/openRepositoryDirectory.adapter";
import { assertRepositoryReadActive } from "../../../../../services/ai-control-plane/src/readRepositoryFile.service";
import type { GitReadContext, GitReadSnapshot } from "./GitRead.types";

/** Metadata не подтверждает чистоту дерева и не заменяет content fingerprint. */
export async function readGitHead(
  context: GitReadContext,
): Promise<Pick<GitReadSnapshot, "head" | "branch" | "detached" | "unborn">> {
  const signal = AbortSignal.any([
    ...(context.signal ? [context.signal] : []),
    AbortSignal.timeout(2000),
  ]);
  assertRepositoryReadActive(signal);
  const directory = await openRepositoryDirectory(context.policy, "");
  try {
    // Child cwd должен ссылаться на descriptor родителя, а не на собственную таблицу /proc/self/fd.
    const cwd = directory.descriptorPath.replace(
      "/proc/self/",
      `/proc/${process.pid}/`,
    );
    const git = new Git(cwd, { timeoutMs: 2000, maxOutputBytes: 16384 });
    const verify = async () => {
      try {
        await directory.verify();
      } catch {
        throw new RepositoryReadError(
          "CONFLICT",
          "Корень рабочей области изменился во время чтения Git.",
        );
      }
      assertRepositoryReadActive(signal);
    };
    const run = async (args: string[]) => {
      await verify();
      try {
        return await git.run(args, { machineRead: true, signal });
      } finally {
        await verify();
      }
    };
    if (
      (await run(["rev-parse", "--show-toplevel"])).trimEnd() !==
      context.policy.root
    )
      throw new RepositoryReadError(
        "FORBIDDEN",
        "Git root не совпадает с рабочей областью.",
      );
    const optional = async (args: string[]) => {
      try {
        return (await run(args)).trim();
      } catch (error) {
        if (error instanceof GitFailure && error.exitCode === 1) return null;
        throw error;
      }
    };
    const read = async () => {
      // Пара независимых queries выполняется вместе; следующий раунд ждёт оба завершения.
      // При отказе descriptor остаётся открыт до cleanup всех начатых Git процессов.
      const [head, branch] = await Promise.allSettled([
        optional(["rev-parse", "--verify", "--quiet", "HEAD"]),
        optional(["symbolic-ref", "--quiet", "--short", "HEAD"]),
      ]);
      if (head.status === "rejected") throw head.reason;
      if (branch.status === "rejected") throw branch.reason;
      return { head: head.value, branch: branch.value };
    };
    const before = await read();
    const after = await read();
    // Раздельные команды не дают атомарной пары: смена refs требует нового запроса.
    if (before.head !== after.head || before.branch !== after.branch)
      throw new RepositoryReadError(
        "CONFLICT",
        "HEAD или ветка изменились во время чтения Git.",
      );
    await verify();
    const { head, branch } = after;
    return {
      head,
      branch,
      detached: branch === null && head !== null,
      unborn: head === null,
    };
  } finally {
    await directory.close();
  }
}
