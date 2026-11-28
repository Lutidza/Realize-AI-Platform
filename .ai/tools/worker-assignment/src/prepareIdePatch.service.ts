/**
 * @file .ai/tools/worker-assignment/src/prepareIdePatch.service.ts
 * @version 1.0.0
 * @date 2026-11-27
 * @description Воспроизводит квитанцию в отдельном индексе Git и закрепляет точные образы всех файлов.
 * @see documentation/specifications/internal-mcp.md
 */
import { createHash, randomUUID } from "node:crypto";
import { Git, type GitLock } from "@realize/git-runtime";
import { createBoundWorktree } from "../../../../services/ai-execution-worker/src/worktree";
import { removeIdeWorktree } from "../../../../services/ai-execution-worker/src/removePromotionWorktree.service";
import type {
  IdeWriteAssignment,
  verifyIdeWriteReceipt,
} from "./ideWriteAssignment.contract";

export type IdePatchFile = {
  path: string;
  action: "create" | "modify" | "delete";
  before: string | null;
  after: string | null;
};

/** Режим и полный blob OID определяют обе версии. Нулевой режим обозначает отсутствие файла. */
export async function prepareIdePatch(
  repositoryRoot: string,
  workspaceRoot: string,
  lease: GitLock,
  assignment: IdeWriteAssignment,
  receipt: ReturnType<typeof verifyIdeWriteReceipt>,
): Promise<IdePatchFile[]> {
  const workspaceID = randomUUID();
  const input = {
    repositoryRoot,
    workspaceRoot,
    workspaceID,
    branch: "ai/change-" + workspaceID,
    baseCommit: receipt.baseCommit,
    existingLease: lease,
  };
  const workspace = await createBoundWorktree(input);
  const git = new Git(workspace, {
    profile: "service",
    maxOutputBytes: 2 * 1024 * 1024,
  });
  git.attachLock(lease);
  try {
    await git.run(["apply", "--cached", "--whitespace=nowarn"], {
      input: receipt.diff,
    });
    const options = ["diff", "--cached", "--no-textconv", "--no-ext-diff"];
    await git.run([...options, "--check", "HEAD", "--"]);
    const reproduced = await git.run([...options, "--binary", "HEAD", "--"]);
    if (
      createHash("sha256").update(reproduced).digest("hex") !==
      receipt.diffSha256
    )
      throw new Error("assignment_apply_diff_mismatch");
    const raw = (
      await git.run([
        ...options,
        "--no-abbrev",
        "--no-renames",
        "--raw",
        "-z",
        "HEAD",
        "--",
      ])
    ).split("\0");
    const files: IdePatchFile[] = [];
    for (let i = 0; i < raw.length - 1; i += 2) {
      const metadata =
        /^:(000000|100644|100755) (000000|100644|100755) ([a-f0-9]{40}) ([a-f0-9]{40}) ([AMD])$/.exec(
          raw[i],
        );
      const path = raw[i + 1];
      if (!metadata || !receipt.changedPaths.includes(path))
        throw new Error("assignment_apply_scope_mismatch");
      const [, oldMode, newMode, oldOid, newOid, status] = metadata;
      const action =
        status === "A" ? "create" : status === "D" ? "delete" : "modify";
      const operations = assignment.permissions.operations;
      if (
        (action === "modify" && oldMode !== newMode) ||
        (operations &&
          !operations.some((op) => op.action === action && op.path === path))
      )
        throw new Error("assignment_apply_operation_mismatch: " + path);
      files.push({
        path,
        action,
        before: oldMode === "000000" ? null : oldMode + " " + oldOid,
        after: newMode === "000000" ? null : newMode + " " + newOid,
      });
    }
    if (
      files.length !== receipt.changedPaths.length ||
      !receipt.changedPaths.every((path) =>
        files.some((file) => file.path === path),
      )
    )
      throw new Error("assignment_apply_scope_mismatch");
    return files;
  } finally {
    git.detachLock();
    await removeIdeWorktree(input);
  }
}
