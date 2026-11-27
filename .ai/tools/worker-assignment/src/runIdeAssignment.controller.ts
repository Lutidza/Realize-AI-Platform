/**
 * @file .ai/tools/worker-assignment/src/runIdeAssignment.controller.ts
 * @version 1.1.0
 * @date 2026-11-27
 * @description Выдаёт локальному оркестратору привязку и принимает отчёт по ключу попытки.
 * @see .ai/tools/worker-assignment/README.md
 */
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createRepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { IdeAssignmentQueue } from "realize-ai-platform/ide-assignment-queue";
import { authorizeIdeWrite } from "./dispatchIdeWrite.service";
import { authorizeIdeStage } from "./authorizeIdeStage.service";
import { bindAssignment } from "./bindAssignment.service";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const policy = await createRepositoryReadPolicy(root, true);
const queue = new IdeAssignmentQueue(
  process.env.REALIZE_IDE_ASSIGNMENT_QUEUE ?? "",
  policy.root,
);
try {
  const command = process.argv[2];
  if (command === "claim" || command === "wait-claim") {
    let job = queue.claim(false);
    while (!job && command === "wait-claim") {
      await delay(5000);
      job = queue.claim(false);
    }
    if (!job) console.log("null");
    else {
      const bound = await bindAssignment(policy, job.lockPath);
      if (!bound.context || bound.report.lockSha256 !== job.lockSha256) {
        queue.finish(
          job.runId,
          job.token,
          "blocked",
          "Привязка недоступна или её содержимое изменилось.",
        );
        console.log(JSON.stringify({ runId: job.runId, status: "blocked" }));
      } else {
        console.log(
          JSON.stringify({
            ...job,
            contextId: bound.context.contextId,
            assignmentId: bound.report.assignmentId,
            revision: bound.report.revision,
          }),
        );
      }
    }
  } else if (
    ["finish", "authorize-stage", "authorize-write"].includes(command)
  ) {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 210000) throw new Error("Слишком большой отчёт.");
      chunks.push(chunk);
    }
    const payload: unknown = JSON.parse(Buffer.concat(chunks).toString());
    if (command === "authorize-write") {
      console.log(
        JSON.stringify(
          await authorizeIdeWrite(
            policy,
            process.env.REALIZE_IDE_ASSIGNMENT_QUEUE!,
            payload,
          ),
        ),
      );
    } else if (command === "authorize-stage") {
      console.log(
        JSON.stringify(
          await authorizeIdeStage(
            policy,
            process.env.REALIZE_IDE_ASSIGNMENT_QUEUE!,
            payload,
          ),
        ),
      );
    } else {
      const input = z
        .strictObject({
          runId: z.uuid(),
          token: z.uuid(),
          status: z.enum(["completed", "blocked"]),
          report: z.string(),
        })
        .parse(payload);
      queue.finish(input.runId, input.token, input.status, input.report);
      console.log(JSON.stringify({ runId: input.runId, status: input.status }));
    }
  } else
    throw new Error(
      "Ожидается claim, wait-claim, authorize-stage, authorize-write или finish.",
    );
} finally {
  queue.close();
}
