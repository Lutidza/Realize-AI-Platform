/**
 * @file .ai/tools/worker-assignment/src/serveIdeAssignments.controller.ts
 * @version 1.3.0
 * @date 2026-11-27
 * @description Ведёт циклы claim, привязки, отдельного исполнения и finish независимо от диалога.
 * @see documentation/specifications/internal-mcp.md
 */
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createRepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { IdeAssignmentQueue } from "realize-ai-platform/ide-assignment-queue";
import { bindAssignment } from "./bindAssignment.service";
import { executeIsolatedIdeAudit } from "./adapters/executeIsolatedIdeAudit.adapter";

import { routeIdeTask } from "./routeIdeTask.service";
import { runTextAudit } from "./runTextAudit.service";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const policy = await createRepositoryReadPolicy(root, true);
const queueDirectory = process.env.REALIZE_IDE_ASSIGNMENT_QUEUE ?? "";
const queue = new IdeAssignmentQueue(queueDirectory, policy.root);
const stopping = new AbortController();
const stop = () => stopping.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  while (!stopping.signal.aborted) {
    const job = queue.claim();
    if (!job) {
      await delay(3000, undefined, { signal: stopping.signal }).catch(() =>
        stopping.signal.throwIfAborted(),
      );
      continue;
    }
    let result;
    try {
      if (job.task) {
        const renew = () => queue.renew(job.runId, job.token);
        result =
          (await routeIdeTask(
            policy,
            queueDirectory,
            job.runId,
            job.task,
            stopping.signal,
            renew,
            job.grantKey,
          )) ??
          (await runTextAudit(
            policy,
            job.runId,
            job.task,
            stopping.signal,
            () => queue.renew(job.runId, job.token),
            {
              record: (delivery) =>
                queue.recordDelivery(job.runId, job.token, delivery),
              search: (step, evidence) =>
                queue.recordSearchStep(job.runId, job.token, step, evidence),
              read: () => queue.readDeliveries(job.runId, job.token),
              archive: () => queue.priorAuditMaterial(job.runId, job.token),
              priorPaths: () => queue.priorSearchPaths(job.runId, job.token),
            },
          ));
      } else {
        const bound = await bindAssignment(policy, job.lockPath);
        if (!bound.context || bound.report.lockSha256 !== job.lockSha256)
          throw new Error("assignment_binding_changed");
        result = await executeIsolatedIdeAudit(
          bound,
          stopping.signal,
          {},
          undefined,
          "",
          (ranges) =>
            queue.recordDelivery(job.runId, job.token, {
              assignmentId: job.runId,
              ranges,
            }),
        );
      }
    } catch (error) {
      if (stopping.signal.aborted) break;
      const reason =
        error instanceof Error &&
        /^assignment_[a-z_]+(?::|$)/.test(error.message)
          ? error.message.slice(0, 4000)
          : "assignment_executor_unavailable";
      result = {
        status: "blocked" as const,
        report: "Исполнение остановлено: " + reason,
      };
    }
    queue.finish(job.runId, job.token, result.status, result.report);
    console.log(JSON.stringify({ runId: job.runId, status: result.status }));
  }
} catch (error) {
  if (!stopping.signal.aborted) throw error;
} finally {
  queue.close();
}
