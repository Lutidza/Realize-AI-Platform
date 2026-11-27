/**
 * @file .ai/tools/worker-assignment/src/dispatchIdeGitDelivery.service.ts
 * @version 1.0.1
 * @date 2026-11-27
 * @description Передаёт разрешённые этапы одному или нескольким штатным Git-воркерам и связывает push с подтверждённым коммитом.
 * @see .ai/tools/git-delivery/README.md
 */
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { link, lstat, realpath, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { validateGitManageContext } from "../../git-delivery/src/manage/validateGitManageContext.validator";
import { loadGitContext } from "../../git-delivery/src/loadGitContext.adapter";

const execute = promisify(execFile);
const context = z
  .object({ requestId: z.string(), repositoryRoot: z.string() })
  .passthrough();
const grantSchema = z
  .strictObject({
    version: z.literal(1),
    taskSha256: z.hash("sha256"),
    verification: z.record(z.string(), z.unknown()),
    commit: z
      .strictObject({ message: z.string().trim().min(1), context })
      .optional(),
    push: z.strictObject({ fromCommit: z.boolean(), context }).optional(),
  })
  .refine((g) => !!(g.commit || g.push) && (!g.push?.fromCommit || !!g.commit));
const stageGrant = z.strictObject({
  version: z.literal(1),
  taskSha256: z.hash("sha256"),
  stage: z.strictObject({ context }),
});
const oid = z.string().regex(/^[a-f0-9]{40}$/);
const receipt = z.strictObject({
  action: z.enum(["commit", "push"]),
  branch: z.string().min(1),
  oid,
  requestId: z.string(),
  grantSha256: z.hash("sha256"),
});
type Receipt = z.infer<typeof receipt>;
type JobResult = { status: "blocked" | "completed"; report: string };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

async function optionalFile(path: string) {
  try {
    return await loadGitContext(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Запись без подмены предыдущего назначения. После обрыва повтор использует тот же requestId и те же байты. */
export async function persistIdeGitContext(path: string, value: unknown) {
  const temporary = path + "." + randomUUID();
  await writeFile(temporary, JSON.stringify(value), {
    mode: 0o600,
    flag: "wx",
  });
  try {
    try {
      await link(temporary, path);
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" ||
        JSON.stringify(await loadGitContext(path)) !== JSON.stringify(value)
      )
        throw new Error("assignment_git_context_conflict");
    }
  } finally {
    await unlink(temporary);
  }
}

/** Только OID результата commit может заполнить явно назначенную зависимость push. Все остальные поля задаёт владелец. */
export function bindIdePush(
  context: Record<string, unknown>,
  prior: Receipt | undefined,
) {
  const target = z
    .object({ branch: z.string(), sourceOid: z.literal("$commit") })
    .passthrough()
    .parse(context.target);
  const authorization = z
    .strictObject({
      actions: z.tuple([z.literal("push")]),
      scope: z.strictObject({
        mode: z.literal("commits"),
        commits: z.array(z.union([oid, z.literal("$commit")])),
      }),
    })
    .parse(context.authorization);
  if (
    !prior ||
    prior.action !== "commit" ||
    prior.branch !== target.branch ||
    authorization.scope.commits.filter((x) => x === "$commit").length !== 1
  )
    throw new Error("assignment_git_dependency_invalid");
  return {
    ...context,
    target: { ...target, sourceOid: prior.oid },
    authorization: {
      ...authorization,
      scope: {
        ...authorization.scope,
        commits: authorization.scope.commits.map((x) =>
          x === "$commit" ? prior.oid : x,
        ),
      },
    },
  };
}

type WorkerCall = (
  root: string,
  action: "commit" | "push" | "manage",
  contextPath: string,
  planPath: string | undefined,
  message: string | undefined,
  signal: AbortSignal,
) => Promise<unknown>;
const runWorker: WorkerCall = async (
  root,
  action,
  contextPath,
  planPath,
  message,
  signal,
) => {
  const args = [
    "--import",
    "tsx",
    join(root, ".ai/tools/git-delivery/src/worker/runGitWorker.controller.ts"),
    action,
  ];
  if (message !== undefined) args.push(message);
  try {
    const { stdout } = await execute(process.execPath, args, {
      cwd: root,
      signal,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        REALIZE_GIT_CONTEXT_FILE: contextPath,
        REALIZE_GIT_VERIFICATION_PLAN: planPath,
      },
    });
    return JSON.parse(stdout);
  } catch (error) {
    signal.throwIfAborted();
    const output = (error as { stdout?: string }).stdout;
    if (output) return JSON.parse(output);
    throw new Error("assignment_git_worker_unavailable");
  }
};

export async function dispatchIdeGitDelivery(
  queueDirectory: string,
  root: string,
  runId: string,
  task: string,
  signal: AbortSignal,
  renew: () => void,
  worker: WorkerCall = runWorker,
  grantKey?: string,
): Promise<JobResult | undefined> {
  z.uuid().parse(runId);
  const parent = await realpath(queueDirectory);
  let directory = join(parent, "git-" + runId);
  if (grantKey) {
    z.hash("sha256").parse(grantKey);
    const prior = join(parent, "git-key-" + grantKey);
    const candidate = await lstat(prior).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      },
    );
    if (candidate) directory = prior;
  }
  const info = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (!info) return;
  if (
    !info.isDirectory() ||
    info.uid !== process.getuid?.() ||
    info.mode & 0o077
  )
    throw new Error("assignment_git_directory_invalid");
  const grant = z
    .union([grantSchema, stageGrant])
    .parse(await loadGitContext(join(directory, "route.json")));
  if (grant.taskSha256 !== hash(task))
    throw new Error("assignment_git_task_mismatch");
  const digest = hash(JSON.stringify(grant)),
    planPath = join(directory, "verification.json");

  const records: Receipt[] = [];
  const abort = new AbortController();
  const active = AbortSignal.any([signal, abort.signal]);
  const heartbeat = setInterval(() => {
    try {
      renew();
    } catch (error) {
      abort.abort(error);
    }
  }, 60_000);
  try {
    if ("stage" in grant) {
      const requestId = runId + "-stage";
      const input = grant.stage.context;
      if (
        input.repositoryRoot !== root ||
        ![requestId, "$runId-stage"].includes(input.requestId)
      )
        throw new Error("assignment_git_context_mismatch");
      const assigned = validateGitManageContext({ ...input, requestId });
      if (assigned.operation.kind !== "stage-file" || !assigned.expected)
        throw new Error("assignment_git_stage_invalid");
      const path = join(directory, "stage.json");
      await persistIdeGitContext(path, assigned);
      active.throwIfAborted();
      renew();
      const response = z
        .object({
          status: z.string(),
          errorCode: z.string().nullable(),
          result: z
            .object({
              action: z.string().nullable(),
              requestId: z.string().nullable(),
              status: z.string(),
              commit: z.string().nullable(),
              branch: z.string().nullable(),
              commitCreated: z.boolean().nullable(),
              pushStatus: z.string(),
              details: z
                .object({
                  kind: z.literal("stage-file"),
                  path: z.string(),
                  sha256: z.hash("sha256"),
                  blobOid: oid,
                  otherEntriesSha256: z.hash("sha256"),
                })
                .optional(),
            })
            .nullable(),
        })
        .parse(
          await worker(root, "manage", path, undefined, undefined, active),
        );
      active.throwIfAborted();
      renew();
      const result = response.result;
      if (
        response.status !== "succeeded" ||
        !result ||
        !["succeeded", "noop"].includes(result.status) ||
        result.requestId !== requestId ||
        result.action !== "manage" ||
        result.commit !== assigned.expected.head ||
        result.branch !== assigned.expected.branch ||
        result.commitCreated !== false ||
        result.pushStatus !== "not_requested" ||
        result.details?.path !== assigned.operation.path ||
        result.details.sha256 !== assigned.operation.sha256
      )
        return {
          status: "blocked",
          report:
            "assignment_git_stage_unconfirmed: " +
            (response.errorCode ?? "worker_receipt_mismatch"),
        };
      return {
        status: "completed",
        report: JSON.stringify({
          workflow: "git-delivery",
          completed: [
            {
              action: "stage",
              workerAction: result.action,
              requestId,
              status: result.status,
              head: result.commit,
              branch: result.branch,
              commitCreated: result.commitCreated,
              pushStatus: result.pushStatus,
              ...result.details,
            },
          ],
        }),
      };
    }
    await persistIdeGitContext(planPath, grant.verification);
    for (const action of ["commit", "push"] as const) {
      const step = grant[action];
      if (!step) continue;
      active.throwIfAborted();
      renew();
      const requestId = runId + "-" + action;
      if (
        (step.context.requestId !== requestId &&
          step.context.requestId !== "$runId-" + action) ||
        step.context.repositoryRoot !== root
      )
        throw new Error("assignment_git_context_mismatch");
      const path = join(directory, action + ".json");
      const operationContext = { ...step.context, requestId };
      const assigned: Record<string, unknown> =
        action === "push" && grant.push?.fromCommit
          ? bindIdePush(operationContext, records[0])
          : operationContext;
      await persistIdeGitContext(path, assigned);
      const receiptPath = join(directory, action + "-receipt.json");
      const existing = await optionalFile(receiptPath);
      if (existing !== undefined) {
        const saved = receipt.parse(existing);
        if (
          saved.action !== action ||
          saved.requestId !== requestId ||
          saved.grantSha256 !== digest
        )
          throw new Error("assignment_git_receipt_conflict");
        records.push(saved);
        continue;
      }
      const response = z
        .object({
          status: z.string(),
          errorCode: z.string().nullable(),
          result: z
            .object({
              action: z.string().nullable(),
              status: z.string(),
              requestId: z.string().nullable(),
              branch: z.string().nullable(),
              commit: z.string().nullable(),
              pushStatus: z.string(),
              remoteCommit: z.string().nullable().optional(),
              diagnostic: z
                .object({
                  stage: z.string(),
                  category: z.string(),
                  exitCode: z.number().nullable(),
                })
                .optional(),
            })
            .nullable(),
        })
        .parse(
          await worker(
            root,
            action,
            path,
            planPath,
            action === "commit" ? grant.commit!.message : undefined,
            active,
          ),
        );
      active.throwIfAborted();
      renew();
      const result = response.result;
      if (
        response.status !== "succeeded" ||
        !result ||
        result.action !== action ||
        result.requestId !== requestId ||
        !["succeeded", "noop"].includes(result.status) ||
        (action === "push" &&
          (result.pushStatus !== "succeeded" ||
            result.remoteCommit !==
              (assigned.target as { sourceOid: string }).sourceOid))
      ) {
        return {
          status: "blocked",
          report: JSON.stringify({
            completed: records,
            action,
            status: response.status,
            errorCode: response.errorCode,
            result,
          }),
        };
      }
      const saved = receipt.parse({
        action,
        requestId,
        branch: result.branch,
        oid: action === "push" ? result.remoteCommit : result.commit,
        grantSha256: digest,
      });
      await persistIdeGitContext(receiptPath, saved);
      records.push(saved);
    }
  } finally {
    clearInterval(heartbeat);
  }
  return {
    status: "completed",
    report: JSON.stringify({ workflow: "git-delivery", completed: records }),
  };
}
