/**
 * @file .ai/tools/task-workspace/src/Dossier.repository.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Читает versioned TASK frontmatter и сохраняет тело legacy досье при CAS mutations.
 * @see documentation/specifications/task-management-execution.md
 */
import YAML from "yaml";
import {
  workspaceTaskSchema,
  workspaceArtifactManifestSchema,
} from "@realize/payload-task-manager/workspace-contracts";
import { hashBytes } from "./hashWorkspaceTree.adapter.mjs";
import { safeTaskKey } from "./WorkspaceFs.adapter.mjs";
import { fail } from "./Workspace.error.mjs";
export function dossierBase(storage, key) {
  safeTaskKey(key);
  const locations = [
    `.ai-workspace/tasks/${key}`,
    `.ai-workspace/history/${key}`,
  ].filter((p) => storage.exists(`${p}/TASK.md`));
  if (locations.length !== 1)
    fail(locations.length ? "dossier_collision" : "task_not_found");
  return locations[0];
}
export function readDossier(storage, key) {
  const base = dossierBase(storage, key);
  const raw = storage.read(`${base}/TASK.md`);
  const text = raw.toString("utf8");
  if (!text.startsWith("---\n"))
    return {
      base,
      body: text,
      documentHash: hashBytes(raw),
      bodyHash: hashBytes(raw),
      meta: null,
    };
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) fail("invalid_frontmatter");
  const doc = YAML.parseDocument(text.slice(4, end), { uniqueKeys: true });
  if (doc.errors.length) fail("invalid_frontmatter");
  let parsed;
  try {
    parsed = doc.toJS({ maxAliasCount: 0 });
  } catch {
    fail("invalid_frontmatter");
  }
  const meta = workspaceTaskSchema.parse(parsed);
  if (meta.localKey !== key) fail("dossier_identity_mismatch");
  const body = text.slice(end + 5);
  return {
    base,
    body,
    meta,
    documentHash: hashBytes(raw),
    bodyHash: hashBytes(Buffer.from(body)),
  };
}
export function requireManaged(dossier, expectedRevision) {
  if (!dossier.meta)
    fail(
      "legacy_requires_adoption",
      "Legacy TASK требуется явно принять через adopt.",
    );
  if (
    arguments.length > 1 &&
    (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
  )
    fail("expected_revision_required");
  if (
    expectedRevision !== undefined &&
    dossier.meta.revision !== expectedRevision
  )
    fail("revision_conflict");
  return dossier.meta;
}
export function writeDossier(storage, dossier, meta) {
  const actual = readDossier(storage, meta.localKey);
  if (actual.documentHash !== dossier.documentHash) fail("document_conflict");
  const next = workspaceTaskSchema.parse(meta);
  storage.write(
    `${actual.base}/TASK.md`,
    "---\n" + YAML.stringify(next, { lineWidth: 0 }) + "---\n" + dossier.body,
  );
  return readDossier(storage, meta.localKey);
}
export function readArtifacts(storage, dossier) {
  const file = `${dossier.base}/artifact-manifest.json`;
  if (!storage.exists(file))
    return {
      schemaVersion: 1,
      localDossierId: requireManaged(dossier).localDossierId,
      revision: 1,
      artifacts: [],
    };
  const manifest = workspaceArtifactManifestSchema.parse(storage.json(file));
  if (manifest.localDossierId !== dossier.meta.localDossierId)
    fail("artifact_owner_mismatch");
  return manifest;
}
export function writeArtifacts(storage, dossier, manifest) {
  storage.writeJson(
    `${dossier.base}/artifact-manifest.json`,
    workspaceArtifactManifestSchema.parse(manifest),
  );
}
