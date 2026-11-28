/**
 * @file .ai/tools/worker-assignment/src/applyIdeWriteReceipt.service.ts
 * @version 1.0.0
 * @date 2026-11-27
 * @description Переносит отдельно подтверждённый diff из очереди в checkout под общей блокировкой Git.
 * @see documentation/specifications/internal-mcp.md
 */
import { createHash } from "node:crypto";
import { Git, withGitRepositoryLock } from "@realize/git-runtime";
import {
  isRepositoryPathAllowed,
  readRepositoryFile,
  type RepositoryReadPolicy,
} from "realize-ai-platform/repository-read-policy";
import { resolveTemplateWriteScope } from "../../../../services/ai-execution-worker/src/resolveTemplateWriteScope.service";
import { prepareIdePatch } from "./prepareIdePatch.service";
import {
  verifyIdeWriteReceipt,
  type IdeWriteAssignment,
} from "./ideWriteAssignment.contract";

/** Считывает байты и режим через закреплённый descriptor. Отсутствующему пути соответствует null. */
async function workingImage(policy: RepositoryReadPolicy, path: string) {
  try {
    const { bytes, mode } = await readRepositoryFile(policy, path);
    const oid = createHash("sha1")
      .update("blob " + bytes.length + "\0")
      .update(bytes)
      .digest("hex");
    return (mode & 0o100 ? "100755" : "100644") + " " + oid;
  } catch (error) {
    if ((error as { code?: string }).code === "NOT_FOUND") return null;
    throw new Error("assignment_apply_unsafe_path: " + path);
  }
}

/** Проверяет весь набор до записи. После потери ответа продолжает только со сверенных исходных или итоговых байтов. */
export async function applyIdeWriteReceipt(
  policy: RepositoryReadPolicy,
  workspaceRoot: string,
  assignment: IdeWriteAssignment,
  apply: { diffSha256: string; receipt: string; started: boolean },
  begin: () => void,
  signal: AbortSignal,
) {
  const receipt = verifyIdeWriteReceipt(assignment, JSON.parse(apply.receipt));
  if (
    receipt.diffSha256 !== apply.diffSha256 ||
    receipt.changedPaths.some((path) => !isRepositoryPathAllowed(policy, path))
  )
    throw new Error("assignment_apply_receipt_mismatch");
  return withGitRepositoryLock(
    { repositoryRoot: policy.root, signal },
    async (lease) => {
      const git = new Git(policy.root, { profile: "service" });
      git.attachLock(lease);
      try {
        const assertHead = async () => {
          if (
            (await git.run(["rev-parse", "HEAD"])).trim() !== receipt.baseCommit
          )
            throw new Error("assignment_apply_base_changed");
        };
        await assertHead();
        await resolveTemplateWriteScope(
          policy.root,
          receipt.baseCommit,
          receipt.changedPaths,
        );
        const files = await prepareIdePatch(
          policy.root,
          workspaceRoot,
          lease,
          assignment,
          receipt,
        );
        const readIndex = () =>
          git.run([
            "--literal-pathspecs",
            "ls-files",
            "--stage",
            "-z",
            "--",
            ...receipt.changedPaths,
          ]);
        const index = await readIndex();
        const expectedIndex = files
          .filter((file) => file.before)
          .map((file) => file.before + " 0\t" + file.path)
          .sort();
        if (
          JSON.stringify(index.split("\0").filter(Boolean).sort()) !==
          JSON.stringify(expectedIndex)
        )
          throw new Error("assignment_apply_index_conflict");
        const pending = [];
        for (const file of files) {
          const image = await workingImage(policy, file.path);
          if (apply.started && image === file.after) continue;
          if (image !== file.before)
            throw new Error("assignment_apply_worktree_conflict: " + file.path);
          pending.push(file);
        }
        if (pending.length) {
          const paths = pending.map((file) => "--include=" + file.path);
          await git.run(["apply", "--check", "--whitespace=nowarn", ...paths], {
            input: receipt.diff,
          });
          await assertHead();
          if ((await readIndex()) !== index)
            throw new Error("assignment_apply_index_conflict");
          for (const file of pending)
            if ((await workingImage(policy, file.path)) !== file.before)
              throw new Error(
                "assignment_apply_worktree_conflict: " + file.path,
              );
          signal.throwIfAborted();
          begin();
          await git.run(["apply", "--whitespace=nowarn", ...paths], {
            input: receipt.diff,
          });
        }
        await assertHead();
        if ((await readIndex()) !== index)
          throw new Error("assignment_apply_index_conflict");
        for (const file of files)
          if ((await workingImage(policy, file.path)) !== file.after)
            throw new Error("assignment_apply_result_mismatch: " + file.path);
        return {
          status: "completed" as const,
          report: JSON.stringify({
            phase: "applied",
            runId: assignment.id,
            baseCommit: receipt.baseCommit,
            diffSha256: receipt.diffSha256,
            files: files.map(({ path, action, after }) => ({
              path,
              action,
              result: after,
            })),
            checks: [
              "scope",
              "git apply --check",
              "working-tree blobs and modes",
              "index",
              "HEAD",
            ],
          }),
        };
      } finally {
        git.detachLock();
      }
    },
  );
}
