/**
 * @file .ai/tools/task-workspace/src/createDossier.service.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Создаёт или явно принимает legacy досье без потери тела и без выдуманных серверных IDs.
 * @see documentation/specifications/task-management-execution.md
 */
import { randomUUID } from "node:crypto";
import { workspaceTaskSchema } from "@realize/payload-task-manager/workspace-contracts";
import { safeTaskKey } from "./WorkspaceFs.adapter.mjs";
import { withWorkspaceLock } from "./withWorkspaceLock.adapter.mjs";
import {
  readDossier,
  writeDossier,
  writeArtifacts,
} from "./Dossier.repository.mjs";
import { fail } from "./Workspace.error.mjs";
import YAML from "yaml";
export function createDossier(storage, input, adopt = false) {
  const key = safeTaskKey(input.key);
  if (
    input.category !== undefined &&
    (!adopt || !["open", "active"].includes(input.category))
  )
    fail("invalid_adoption_category");
  return withWorkspaceLock(storage, key, () => {
    let previous;
    if (adopt) {
      previous = readDossier(storage, key);
      if (previous.meta) fail("already_managed");
      if (previous.base.includes("/history/"))
        fail("legacy_archive_requires_review");
    } else if (
      storage.exists(`.ai-workspace/tasks/${key}`) ||
      storage.exists(`.ai-workspace/history/${key}`)
    )
      fail("dossier_collision");
    const now = new Date().toISOString();
    const body = adopt
      ? previous.body
      : (input.body ??
        `# ${input.title}\n\n## Цель\n\n## Границы\n\n## Критерии завершения\n\n## Результат и следующий шаг\n`);
    if (Buffer.byteLength(body) > 512 * 1024) fail("body_limit");
    const meta = workspaceTaskSchema.parse({
      schemaVersion: 1,
      localDossierId: randomUUID(),
      localKey: key,
      revision: 1,
      title: input.title,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      archivedAt: null,
      status: {
        id: `local:${input.category ?? "open"}`,
        category: input.category ?? "open",
      },
      outcome: null,
      execution: {
        state: null,
        runtimeRef: null,
        stageId: null,
        attemptId: null,
      },
      acceptance: {
        required: input.acceptanceRequired ?? false,
        state: input.acceptanceRequired ? "pending" : "not_requested",
        resultHash: null,
        criteriaHash: null,
        decidedAt: null,
      },
      delivery: {
        required: input.deliveryRequired ?? false,
        state: input.deliveryRequired ? "pending" : "not_requested",
        evidence: [],
      },
      requiredChecks: input.requiredChecks ?? [],
      result: null,
      taskRef: null,
      legacy: adopt
        ? { originalBodyHash: previous.bodyHash, recordedAt: now }
        : null,
    });
    if (adopt) writeDossier(storage, previous, meta);
    else {
      storage.mkdir(`.ai-workspace/tasks/${key}`);
      storage.write(
        `.ai-workspace/tasks/${key}/TASK.md`,
        "---\n" + YAML.stringify(meta, { lineWidth: 0 }) + "---\n" + body,
        true,
      );
    }
    const dossier = readDossier(storage, key);
    writeArtifacts(storage, dossier, {
      schemaVersion: 1,
      localDossierId: meta.localDossierId,
      revision: 1,
      artifacts: [],
    });
    return dossier.meta;
  });
}
