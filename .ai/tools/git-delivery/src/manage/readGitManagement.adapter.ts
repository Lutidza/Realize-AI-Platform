/**
 * @file .ai/tools/git-delivery/src/manage/readGitManagement.adapter.ts
 * @version 1.0.2
 * @date 2026-11-27
 * @description Возвращает ограниченное чтение локальных Git-метаданных без раскрытия явных секретов.
 */
import { Git } from "@realize/git-runtime";
import { PolicyError } from "@realize/git-runtime";
import { assertNoGitSecrets } from "../commit/assertNoGitSecrets.validator.ts";
import type {
  GitManageDetails,
  GitManageOperation,
} from "./GitManage.types.ts";
import { readStageFileState } from "./stageGitFile.adapter.ts";
import { readGitManageRemote } from "./readGitManageState.adapter.ts";
import { readGitManageDiff } from "./readGitManageDiff.adapter.ts";

/** Проверка охватывает весь результат, включая subjects, пути и patch до его возврата caller. */
export function assertSafeGitManageDetails(details: GitManageDetails): void {
  const bytes = Buffer.from(JSON.stringify(details));
  if (bytes.length > 2 * 1024 * 1024)
    throw new PolicyError(
      "manage_output_limit",
      "Результат manage превышает допустимый размер.",
    );
  assertNoGitSecrets(bytes);
}

export async function readGitManagement(
  git: Git,
  operation: GitManageOperation,
): Promise<GitManageDetails> {
  let details: GitManageDetails;
  switch (operation.kind) {
    case "stage-file": {
      const [current, otherEntriesSha256, desired] = await readStageFileState(
        git,
        operation,
      );
      if (current !== desired)
        throw new PolicyError(
          "manage_result_unknown",
          "Индекс изменился до выдачи квитанции.",
        );
      details = {
        ...operation,
        blobOid: current.split(" ")[1],
        otherEntriesSha256,
      };
      break;
    }
    case "remote-inspect":
    case "remote-set-url":
      details = {
        kind: operation.kind,
        remote: operation.remote,
        ...(await readGitManageRemote(git, operation.remote)),
      };
      break;
    case "worktree-list": {
      const raw = await git.run(["worktree", "list", "--porcelain", "-z"]);
      const worktrees: {
        path: string;
        head: string | null;
        branch: string | null;
      }[] = [];
      let current: (typeof worktrees)[number] | null = null;
      for (const line of raw.split("\0")) {
        if (line.startsWith("worktree ")) {
          current = { path: line.slice(9), head: null, branch: null };
          worktrees.push(current);
        } else if (current && line.startsWith("HEAD "))
          current.head = line.slice(5);
        else if (current && line.startsWith("branch refs/heads/"))
          current.branch = line.slice(18);
      }
      if (worktrees.length > 100)
        throw new PolicyError(
          "manage_output_limit",
          "Слишком много worktrees для одного ответа.",
        );
      details = { kind: operation.kind, worktrees };
      break;
    }
    case "branches-list": {
      const raw = await git.run([
        "for-each-ref",
        "--format=%(refname:short)%00%(objectname)",
        "refs/heads/",
      ]);
      const branches = raw
        .trimEnd()
        .split("\n")
        .filter(Boolean)
        .map((entry) => {
          const [name, head] = entry.split("\0");
          if (!name || !/^[a-f0-9]{40}$/.test(head))
            throw new PolicyError(
              "manage_output_invalid",
              "Некорректные данные веток.",
            );
          return { name, head };
        });
      if (branches.length > 1000)
        throw new PolicyError(
          "manage_output_limit",
          "Слишком много веток для одного ответа.",
        );
      details = { kind: operation.kind, branches };
      break;
    }
    case "log": {
      const raw = await git.run([
        "--no-pager",
        "log",
        "--no-show-signature",
        `--max-count=${operation.limit}`,
        "--format=%H%x00%s%x00",
        "HEAD",
        "--",
      ]);
      assertNoGitSecrets(Buffer.from(raw));
      const fields = raw.split("\0");
      const commits: { head: string; subject: string }[] = [];
      for (let i = 0; i + 1 < fields.length; i += 2) {
        const head = fields[i].trim();
        if (!/^[a-f0-9]{40}$/.test(head))
          throw new PolicyError(
            "manage_output_invalid",
            "Некорректные данные log.",
          );
        commits.push({ head, subject: fields[i + 1] });
      }
      details = { kind: operation.kind, commits };
      break;
    }
    case "diff": {
      const patch = await readGitManageDiff(git, operation);
      details = { kind: operation.kind, scope: operation.scope, patch };
      break;
    }
    case "worktree-repair":
      details = { kind: operation.kind, paths: [...operation.paths] };
      break;
    case "branch-create":
    case "branch-switch": {
      const head = (
        await git.run(
          ["rev-parse", "--verify", `refs/heads/${operation.name}`],
          { machineRead: true },
        )
      ).trim();
      details = { kind: operation.kind, name: operation.name, head };
      break;
    }
  }
  assertSafeGitManageDetails(details);
  return details;
}
