/**
 * @file services/ai-execution-worker/src/executeIdeWriteAssignment.service.ts
 * @version 1.2.0
 * @date 2026-11-27
 * @description Исполняет ограниченное IDE-поручение в worktree и возвращает проверенный полный текст diff.
 * @see documentation/specifications/internal-mcp.md
 */
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { runIsolatedJsonTurn } from "@realize/codex-adapter/isolated-json";
import {
  createRepositoryReadPolicy,
  isRepositoryPathAllowed,
  readRepositoryFile,
} from "realize-ai-platform/repository-read-policy";
import { ideWriteAssignment } from "../../../.ai/tools/worker-assignment/src/ideWriteAssignment.contract";
import { assertNoGitSecrets } from "../../../.ai/tools/git-delivery/src/commit/assertNoGitSecrets.validator";
import { resolveTemplateWriteScope } from "./resolveTemplateWriteScope.service";
import { verifyWorktreeChange } from "./verifyWorktreeChange.service";
import { createBoundWorktree } from "./worktree";
import { removeIdeWorktree } from "./removePromotionWorktree.service";

const editResponse = z.strictObject({
  status: z.enum(["completed", "blocked"]),
  summary: z.string().max(1024),
  edits: z
    .array(z.strictObject({ path: z.string(), content: z.string().nullable() }))
    .max(64),
});
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/** Worktree приватен. До чтения и записи отвергаем ссылки во всех компонентах, каталоги вместо файлов и hardlinks. */
async function existingRegularFile(workspace: string, path: string) {
  const parts = path.split("/");
  let target = workspace;
  for (const [index, part] of parts.entries()) {
    target = join(target, part);
    const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    if (!info) return false;
    if (
      index < parts.length - 1
        ? !info.isDirectory()
        : !info.isFile() || info.nlink !== 1
    )
      throw new Error("assignment_write_unsafe_path: " + path);
  }
  return true;
}

/** Модель возвращает предложения в JSON. Только worker открывает закреплённые файлы и материализует разрешённые правки. */
export async function executeIdeWriteAssignment(
  repositoryRoot: string,
  workspaceRoot: string,
  input: unknown,
  signal: AbortSignal,
  propose = runIsolatedJsonTurn,
) {
  const assignment = ideWriteAssignment.parse(input);
  if (hash(assignment.mission) !== assignment.taskSha256)
    throw new Error("assignment_write_binding_changed");
  const workspaceID = randomUUID();
  const branch = "ai/change-" + workspaceID;
  const worktree = {
    repositoryRoot,
    workspaceRoot,
    workspaceID,
    branch,
    baseCommit: assignment.baseCommit,
  };
  signal.throwIfAborted();
  const workspace = await createBoundWorktree(worktree);
  try {
    const allowedPaths = assignment.permissions.writePaths;
    const verifiedTemplateFiles = await resolveTemplateWriteScope(
      workspace,
      assignment.baseCommit,
      allowedPaths,
    );
    const policy = await createRepositoryReadPolicy(workspace, true);
    const sources = [];
    const existing = new Set<string>();
    let remaining = 384 * 1024;
    for (const path of new Set([
      ...assignment.requiredSources,
      ...allowedPaths,
    ])) {
      if (!isRepositoryPathAllowed(policy, path))
        throw new Error("assignment_write_scope_forbidden: " + path);
      if (!(await existingRegularFile(workspace, path))) {
        if (assignment.requiredSources.includes(path))
          throw new Error("assignment_source_unavailable: " + path);
        sources.push({ path, text: null });
        continue;
      }
      const file = await readRepositoryFile(policy, path, {
        maximumBytes: remaining,
      });
      existing.add(path);
      remaining -= file.bytes.length;
      sources.push({ path, sha256: file.sha256, text: file.text });
    }
    const operations = assignment.permissions.operations;
    for (const op of operations ?? []) {
      if (existing.has(op.path) !== (op.action === "modify"))
        throw new Error("assignment_write_precondition_failed: " + op.path);
    }
    const prompt =
      "Твой этап в ai-execution-worker — подготовка текста правок по mission. Если можешь подготовить правки по sources, верни completed и полное новое UTF-8 содержимое каждого изменяемого файла в edits. null означает удаление. Допустимы только permissions.writePaths. После твоего ответа процесс worker сам запишет файлы, выполнит checks, вычислит SHA-256 и вернёт проверенный diff. Статус твоего этапа означает готовность предложенных текстов. Верни blocked только если невозможно составить их в заявленных границах. Команды и делегирование относятся к оркестратору.\n" +
      JSON.stringify({ assignment, sources });
    const response = editResponse.parse(
      await propose(
        prompt,
        z.toJSONSchema(editResponse, { target: "draft-7" }),
        signal,
      ),
    );
    if (response.status === "blocked") {
      assertNoGitSecrets(Buffer.from(response.summary));
      throw new Error("assignment_worker_blocked: " + response.summary);
    }
    const edited = new Set<string>();
    for (const edit of response.edits) {
      if (!allowedPaths.includes(edit.path) || edited.has(edit.path))
        throw new Error("assignment_write_scope_violation");
      if (operations && edit.content === null)
        throw new Error("assignment_write_operation_forbidden");
      if (edit.content === null && !existing.has(edit.path))
        throw new Error("assignment_write_source_missing");
      if (edit.content !== null) {
        if (edit.content.includes("\0"))
          throw new Error("assignment_write_binary");
        assertNoGitSecrets(Buffer.from(edit.content));
      }
      edited.add(edit.path);
    }
    if (operations?.some((op) => !edited.has(op.path)))
      throw new Error("assignment_write_operations_incomplete");
    signal.throwIfAborted();
    for (const edit of response.edits) {
      const file = join(workspace, edit.path);
      if (edit.content === null) await unlink(file);
      else {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, edit.content, {
          flag: existing.has(edit.path) ? "w" : "wx",
        });
      }
    }
    const diff = await verifyWorktreeChange(
      workspace,
      {
        allowedPaths,
        baseCommit: assignment.baseCommit,
        branch,
        verifiedTemplateFiles,
      },
      async (collected) => {
        if (
          collected.diffTruncated ||
          hash(collected.diff) !== collected.diffHash ||
          collected.changedPaths.some((path) => !edited.has(path)) ||
          [...edited].some((path) => !collected.changedPaths.includes(path))
        )
          throw new Error("assignment_write_diff_incomplete");
        for (const edit of response.edits) {
          if (edit.content === null) {
            if (await existingRegularFile(workspace, edit.path))
              throw new Error("assignment_write_content_mismatch");
          } else {
            const saved = await readRepositoryFile(policy, edit.path);
            if (saved.sha256 !== hash(edit.content))
              throw new Error("assignment_write_content_mismatch");
          }
        }
      },
    );
    assertNoGitSecrets(Buffer.from(diff.diff));
    const receipt = {
      runId: assignment.id,
      executor: assignment.executor,
      baseCommit: assignment.baseCommit,
      allowedPaths,
      changedPaths: diff.changedPaths,
      checks: assignment.checks,
      diffSha256: diff.diffHash,
      diff: diff.diff,
    };
    if (Buffer.byteLength(JSON.stringify(receipt)) > 32768)
      throw new Error("assignment_write_report_limit");
    return receipt;
  } finally {
    await removeIdeWorktree(worktree);
  }
}
