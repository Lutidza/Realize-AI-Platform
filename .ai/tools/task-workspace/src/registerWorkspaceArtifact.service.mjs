/**
 * @file .ai/tools/task-workspace/src/registerWorkspaceArtifact.service.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Регистрирует явно выбранные артефакты и retention по фактическому bounded filesystem snapshot.
 * @see documentation/specifications/task-management-execution.md
 */
import { randomUUID } from "node:crypto";
import { workspaceArtifactManifestSchema } from "@realize/payload-task-manager/workspace-contracts";
import {
  readDossier,
  requireManaged,
  writeDossier,
  readArtifacts,
  writeArtifacts,
} from "./Dossier.repository.mjs";
import { withWorkspaceLock } from "./withWorkspaceLock.adapter.mjs";
import { snapshotTree } from "./hashWorkspaceTree.adapter.mjs";
import { safeRelative } from "./WorkspaceFs.adapter.mjs";
import { processIdentity } from "./readWorkspaceProcesses.adapter.mjs";
import { fail } from "./Workspace.error.mjs";
const prefixes = {
  reference: "references/",
  screenshot: "screenshots/",
  snapshot: "snapshots/",
  log: "logs/",
  draft: "drafts/",
  result: "logs/results/",
  temporary: "tmp/",
};
export function registerWorkspaceArtifacts(
  storage,
  key,
  expectedRevision,
  input,
) {
  if (
    !input ||
    Object.keys(input).some((k) => k !== "artifacts") ||
    !Array.isArray(input.artifacts) ||
    !input.artifacts.length ||
    input.artifacts.length > 1024
  )
    fail("invalid_registration");
  return withWorkspaceLock(storage, key, () => {
    const dossier = readDossier(storage, key);
    const meta = structuredClone(requireManaged(dossier, expectedRevision));
    if (meta.archivedAt || meta.status.category === "closed")
      fail("reopen_required");
    const manifest = readArtifacts(storage, dossier);
    const now = new Date().toISOString();
    for (const item of input.artifacts) {
      if (
        Object.keys(item).some(
          (k) =>
            ![
              "path",
              "category",
              "stageId",
              "attemptId",
              "producer",
              "retention",
            ].includes(k),
        )
      )
        fail("invalid_registration");
      if (
        !item.producer ||
        Object.keys(item.producer).some(
          (k) => !["id", "pid", "settled"].includes(k),
        )
      )
        fail("invalid_producer_input");
      safeRelative(item.path);
      if (
        !prefixes[item.category] ||
        !item.path.startsWith(prefixes[item.category]) ||
        /(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|sqlite|sqlite3|dump)$/.test(
          item.path,
        )
      )
        fail("protected_artifact_path");
      if (
        manifest.artifacts.some(
          (a) =>
            a.state === "ready" &&
            (a.path === item.path ||
              a.path.startsWith(item.path + "/") ||
              item.path.startsWith(a.path + "/")),
        )
      )
        fail("artifact_already_registered");
      const snapshot = snapshotTree(storage, `${dossier.base}/${item.path}`);
      if (snapshot.entries[0].kind === "link") fail("symlink_root");
      const producer = {
        ...item.producer,
        identity:
          item.producer?.pid == null
            ? null
            : processIdentity(item.producer.pid),
      };
      if (producer.pid !== null && !producer.identity)
        fail("producer_identity_required");
      const record = {
        id: randomUUID(),
        revision: 1,
        path: item.path,
        category: item.category,
        bytes: snapshot.bytes,
        hash: snapshot.hash,
        state: "ready",
        createdAt: now,
        stageId: item.stageId ?? null,
        attemptId: item.attemptId ?? null,
        producer,
        retention: item.retention,
      };
      const checked = workspaceArtifactManifestSchema.parse({
        schemaVersion: 1,
        localDossierId: meta.localDossierId,
        revision: manifest.revision,
        artifacts: [record],
      }).artifacts[0];
      if (
        checked.category !== "temporary" &&
        checked.retention.mode === "temporary"
      )
        fail("retained_category_requires_retain");
      manifest.artifacts.push(checked);
    }
    manifest.revision++;
    writeArtifacts(storage, dossier, manifest);
    meta.revision++;
    meta.updatedAt = now;
    return writeDossier(storage, dossier, meta).meta;
  });
}
