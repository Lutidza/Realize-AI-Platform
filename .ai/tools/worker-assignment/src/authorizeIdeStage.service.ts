/**
 * @file .ai/tools/worker-assignment/src/authorizeIdeStage.service.ts
 * @version 1.0.0
 * @date 2026-11-27
 * @description Закрепляет разрешение IDE на один файл до submit без доступа к командам записи Git.
 * @see .ai/tools/worker-assignment/README.md
 */
import { createHash } from "node:crypto";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ideAssignmentGrantKey } from "realize-ai-platform/ide-assignment-queue";
import type { RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { relativeFile } from "../../git-delivery/src/contracts";
import { assertAllowedGitChangedPaths } from "../../git-delivery/src/commit/validateGitChanges.validator";
import { assertNoGitSecrets } from "../../git-delivery/src/commit/assertNoGitSecrets.validator";
import { readGitHead } from "../../git-delivery/src/read/gitRead.server.index";
import { readGitWorkingContent } from "../../git-delivery/src/manage/readGitWorkingContent.adapter";
import { persistIdeGitContext } from "./dispatchIdeGitDelivery.service";

/** Каталог очереди предварительно проверен владельцем IdeAssignmentQueue. Права выдаются только локальным caller. */
export async function authorizeIdeStage(
  policy: RepositoryReadPolicy,
  queueDirectory: string,
  input: unknown,
) {
  const data = z
    .strictObject({
      principalID: z.string().min(1).max(80),
      idempotencyKey: z.string().min(1).max(128),
      task: z.string().trim().min(1).max(2048),
      path: z.string(),
    })
    .parse(input);
  const path = relativeFile(data.path);
  assertAllowedGitChangedPaths([path]);
  const file = await readGitWorkingContent(policy.root, path);
  if (!file) throw new Error("assignment_git_source_missing");
  assertNoGitSecrets(file.bytes);
  const { head, branch } = await readGitHead({ policy });
  if (!head) throw new Error("assignment_git_head_required");
  const key = ideAssignmentGrantKey(
    policy.root,
    data.principalID,
    data.idempotencyKey,
  );
  const directory = join(await realpath(queueDirectory), "git-key-" + key);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.uid !== process.getuid?.() ||
    info.mode & 0o077
  )
    throw new Error("assignment_git_directory_invalid");
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  await persistIdeGitContext(join(directory, "route.json"), {
    version: 1,
    taskSha256: createHash("sha256").update(data.task).digest("hex"),
    stage: {
      context: {
        version: 1,
        projectId: "realize-ai-platform",
        taskId: "ide-stage-" + key,
        requestId: "$runId-stage",
        repositoryRoot: policy.root,
        authorization: { actions: ["manage"], scope: { mode: "repository" } },
        expected: { head, branch },
        operation: { kind: "stage-file", path, sha256 },
      },
    },
  });
  return { action: "stage", path, sha256, head, branch };
}
