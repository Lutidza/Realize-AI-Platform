/**
 * @file .ai/tools/worker-assignment/src/dispatchIdeWrite.service.ts
 * @version 1.1.0
 * @date 2026-11-27
 * @description Связывает приватное разрешение IDE с текстом поручения до выдачи Code Lane Assignment.
 * @see documentation/specifications/internal-mcp.md
 */
import { createHash } from "node:crypto";
import { fork } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import { ideAssignmentGrantKey } from "realize-ai-platform/ide-assignment-queue";
import {
  isRepositoryPathAllowed,
  type RepositoryReadPolicy,
} from "realize-ai-platform/repository-read-policy";
import { resolveTemplateWriteScope } from "../../../../services/ai-execution-worker/src/resolveTemplateWriteScope.service";
import { readGitHead } from "../../git-delivery/src/read/gitRead.server.index";
import { loadGitContext } from "../../git-delivery/src/loadGitContext.adapter";
import { persistIdeGitContext } from "./dispatchIdeGitDelivery.service";
import {
  ideWriteAssignment,
  ideWriteAuthorizationInput,
  verifyIdeWriteReceipt,
  ideWriteGrant,
} from "./ideWriteAssignment.contract";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const grantPath = (queue: string, key: string) =>
  join(queue, "write-key-" + z.hash("sha256").parse(key) + ".json");

/** Вызывается владельцем локальной очереди. MCP principal с одним task_submit не может выдать grant. */
export async function authorizeIdeWrite(
  policy: RepositoryReadPolicy,
  queue: string,
  input: unknown,
) {
  const data = ideWriteAuthorizationInput.parse(input);
  const sources = [
    ...new Set([
      "AGENTS.md",
      data.role,
      ".ai/workflows/core/worker-assignment/WORKFLOW.md",
      ...data.sources,
    ]),
  ];
  if (
    [...sources, ...data.writePaths].some(
      (path) => !isRepositoryPathAllowed(policy, path),
    )
  )
    throw new Error("assignment_write_scope_forbidden");
  const { head } = await readGitHead({ policy });
  if (!head) throw new Error("assignment_write_base_required");
  await resolveTemplateWriteScope(policy.root, head, data.writePaths);
  const grant = ideWriteGrant.parse({
    mode: "scoped-write",
    baseCommit: head,
    taskSha256: hash(data.task),
    role: data.role,
    requiredSources: sources,
    permissions: { writePaths: data.writePaths, output: "verified-diff" },
    checks: ["scope", "git diff --check", "sha256"],
  });
  const key = ideAssignmentGrantKey(
    policy.root,
    data.principalID,
    data.idempotencyKey,
  );
  await persistIdeGitContext(grantPath(queue, key), grant);
  return { baseCommit: grant.baseCommit, writePaths: data.writePaths };
}

/** Передаёт только привязанное к checkout, пользователю, ключу и исходному тексту назначение. */
export async function dispatchIdeWrite(
  policy: RepositoryReadPolicy,
  queue: string,
  id: string,
  mission: string,
  signal: AbortSignal,
  renew: () => void,
  key?: string,
) {
  if (!key) return;
  let raw: unknown;
  try {
    raw = await loadGitContext(grantPath(queue, key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const grant = ideWriteGrant.parse(raw);
  if (grant.taskSha256 !== hash(mission))
    throw new Error("assignment_write_binding_changed");
  const assignment = ideWriteAssignment.parse({
    ...grant,
    id,
    revision: 1,
    mission,
    assignedBy: "orchestrator",
    returnsTo: "orchestrator",
    executor: "ai-execution-worker",
  });
  renew();
  const result = z.strictObject({
    status: z.enum(["blocked", "completed"]),
    report: z.string().min(1),
  });
  const worker = fork(
    new URL(
      "../../../../services/ai-execution-worker/src/worker.ts",
      import.meta.url,
    ),
    ["--ide-assignment"],
    {
      cwd: policy.root,
      execArgv: ["--import=tsx/esm"],
      stdio: ["ignore", "ignore", "inherit", "ipc"],
      signal,
    },
  );
  let answer: z.infer<typeof result> | undefined;
  await new Promise<void>((resolve, reject) => {
    worker.once("error", reject);
    worker.once("message", (value) => {
      const parsed = result.safeParse(value);
      if (parsed.success) answer = parsed.data;
    });
    worker.once("exit", (code) =>
      code === 0 && answer
        ? resolve()
        : reject(new Error("assignment_write_worker_unavailable")),
    );
    worker.send({ workspaceRoot: join(queue, "worktrees"), assignment });
  });
  renew();
  if (!answer) throw new Error("assignment_write_worker_unavailable");
  if (answer.status === "completed")
    verifyIdeWriteReceipt(assignment, JSON.parse(answer.report));
  return answer;
}
