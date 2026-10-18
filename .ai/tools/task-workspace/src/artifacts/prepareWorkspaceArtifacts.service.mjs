/**
 * @file .ai/tools/task-workspace/src/artifacts/prepareWorkspaceArtifacts.service.mjs
 * @version 1.0.1
 * @date 2026-10-15
 * @description Подготавливает и проверяет записи артефактов для регистрации и предварительной проверки producer-группы.
 * @see documentation/specifications/task-management-execution.md
 */
import { randomUUID } from "node:crypto";
import { workspaceArtifactManifestSchema } from "@realize/payload-task-manager/workspace-contracts";
import { snapshotTree } from "../filesystem/snapshotTree.adapter.mjs";
import { processIdentity } from "../consumers/readWorkspaceProcesses.adapter.mjs";
import { fail } from "../Workspace.error.mjs";
import { validateWorkspaceArtifactPath } from "./validateWorkspaceArtifactPath.validator.mjs";

/**
 * Возвращает новые записи без записи манифеста. Предварительный режим проверяет схему до mkdir;
 * штатная регистрация всегда снимает фактическое дерево и идентичность процесса.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {ReturnType<typeof import("../dossier/Dossier.repository.mjs").readDossier>} dossier
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifactManifest} manifest
 * @param {import("./WorkspaceArtifacts.types.ts").WorkspaceArtifactRegistration[]} items
 * @param {import("./WorkspaceArtifacts.types.ts").WorkspaceArtifactPreparationOptions} [options]
 * @returns {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifact[]}
 */
export function prepareWorkspaceArtifacts(
  storage,
  dossier,
  manifest,
  items,
  {
    captureSnapshot = true,
    now = new Date().toISOString(),
    emptyDirectorySnapshot,
  } = {},
) {
  if (
    !captureSnapshot &&
    (!emptyDirectorySnapshot ||
      emptyDirectorySnapshot.bytes !== 0 ||
      !/^[a-f0-9]{64}$/.test(emptyDirectorySnapshot.hash))
  )
    fail("empty_directory_snapshot_required");
  const candidate = { ...manifest, artifacts: [...manifest.artifacts] };
  return items.map((item) => {
    if (
      Object.keys(item).some(
        (name) =>
          ![
            "path",
            "category",
            "stageId",
            "attemptId",
            "producer",
            "retention",
          ].includes(name),
      )
    )
      fail("invalid_registration");
    if (
      !item.producer ||
      Object.keys(item.producer).some(
        (name) => !["id", "pid", "settled"].includes(name),
      )
    )
      fail("invalid_producer_input");
    validateWorkspaceArtifactPath(item, candidate);
    const snapshot = captureSnapshot
      ? snapshotTree(storage, `${dossier.base}/${item.path}`)
      : null;
    if (snapshot && snapshot.entries[0].kind === "link") fail("symlink_root");
    const content = snapshot ?? emptyDirectorySnapshot;
    if (!content) fail("empty_directory_snapshot_required");
    const producer = {
      ...item.producer,
      identity:
        item.producer.pid == null ? null : processIdentity(item.producer.pid),
    };
    if (producer.pid !== null && !producer.identity)
      fail("producer_identity_required");
    const record = {
      id: randomUUID(),
      revision: 1,
      path: item.path,
      category: item.category,
      bytes: content.bytes,
      hash: content.hash,
      state: "ready",
      createdAt: now,
      stageId: item.stageId ?? null,
      attemptId: item.attemptId ?? null,
      producer,
      retention: item.retention,
    };
    const checked = workspaceArtifactManifestSchema.parse({
      schemaVersion: 1,
      localDossierId: manifest.localDossierId,
      revision: manifest.revision,
      artifacts: [record],
    }).artifacts[0];
    if (
      checked.category !== "temporary" &&
      checked.retention.mode === "temporary"
    )
      fail("retained_category_requires_retain");
    candidate.artifacts.push(checked);
    return checked;
  });
}
