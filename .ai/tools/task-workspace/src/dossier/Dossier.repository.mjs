/**
 * @file .ai/tools/task-workspace/src/dossier/Dossier.repository.mjs
 * @version 1.0.4
 * @date 2026-10-15
 * @description Читает versioned TASK frontmatter и сохраняет тело legacy досье при CAS mutations.
 * @see documentation/specifications/task-management-execution.md
 */
import YAML from "yaml";
import {
  workspaceTaskSchema,
  workspaceArtifactManifestSchema,
} from "@realize/payload-task-manager/workspace-contracts";
import { hashBytes } from "../filesystem/canonicalHash.util.mjs";
import { safeTaskKey } from "../filesystem/safeTaskKey.validator.mjs";
import { fail } from "../Workspace.error.mjs";
import { planWorkspaceFile } from "../recovery/commitWorkspaceMetadata.service.mjs";
import { parseDossierText } from "./parseDossierText.validator.mjs";
/**
 * Читает единственное досье по локальному ключу.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} key
 */
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
/**
 * Читает единственное досье по локальному ключу.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} key
 * @returns {import("./Dossier.types").WorkspaceDossier}
 */
export function readDossier(storage, key) {
  const base = dossierBase(storage, key);
  const raw = storage.read(`${base}/TASK.md`);
  const { body, meta } = parseDossierText(raw.toString("utf8"), key);
  return {
    base,
    body,
    meta,
    documentHash: hashBytes(raw),
    bodyHash: hashBytes(meta ? Buffer.from(body) : raw),
  };
}
/**
 * Проверяет наличие metadata и ожидаемую ревизию перед изменением.
 * @param {import("./Dossier.types").WorkspaceDossier} dossier
 * @param {number} [expectedRevision]
 * @returns {import("@realize/payload-task-manager/workspace-contracts").WorkspaceTask}
 */
export function requireManaged(dossier, expectedRevision) {
  if (!dossier.meta)
    fail(
      "legacy_requires_adoption",
      "Legacy TASK требуется явно принять через adopt.",
    );
  if (
    arguments.length > 1 &&
    (typeof expectedRevision !== "number" ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 1)
  )
    fail("expected_revision_required");
  if (
    expectedRevision !== undefined &&
    dossier.meta.revision !== expectedRevision
  )
    fail("revision_conflict");
  return dossier.meta;
}
/**
 * Кодирует проверенные metadata и тело в точные UTF-8 bytes для журнала операции.
 * @param {import("./Dossier.types").WorkspaceTask} meta
 * @param {string} body
 */
export function serializeDossier(meta, body) {
  const next = workspaceTaskSchema.parse(meta);
  return "---\n" + YAML.stringify(next, { lineWidth: 0 }) + "---\n" + body;
}
/**
 * Подготавливает порядок manifest → TASK без записи; documentHash удерживает исходный CAS.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./Dossier.types").WorkspaceDossier} dossier
 * @param {import("./Dossier.types").WorkspaceTask} meta
 * @param {import("./Dossier.types").WorkspaceArtifactManifest} [manifest]
 */
export function planDossierMetadata(storage, dossier, meta, manifest) {
  const actual = readDossier(storage, meta.localKey);
  if (
    actual.documentHash !== dossier.documentHash ||
    actual.base !== dossier.base
  )
    fail("document_conflict");
  const current = readArtifacts(storage, actual);
  const writes = [];
  if (manifest) {
    const next = workspaceArtifactManifestSchema.parse(manifest);
    if (next.localDossierId !== current.localDossierId)
      fail("artifact_owner_mismatch");
    writes.push(
      planWorkspaceFile(
        storage,
        `${actual.base}/artifact-manifest.json`,
        JSON.stringify(next, null, 2) + "\n",
      ),
    );
  } else {
    const path = `${actual.base}/artifact-manifest.json`;
    writes.push(
      planWorkspaceFile(storage, path, storage.read(path, 32 * 1024 * 1024)),
    );
  }
  writes.push(
    planWorkspaceFile(
      storage,
      `${actual.base}/TASK.md`,
      serializeDossier(meta, dossier.body),
    ),
  );
  return writes;
}
/**
 * Проверяет новый или явно принятый legacy TASK и подготавливает всю пару до первого эффекта.
 * Отсутствующие файлы остаются null-условиями сохранённого плана восстановления.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./Dossier.types").WorkspaceTask} meta
 * @param {string} body
 * @param {import("./Dossier.types").WorkspaceDossier} [previous]
 */
export function prepareDossierInitialization(storage, meta, body, previous) {
  const next = workspaceTaskSchema.parse(meta);
  const key = safeTaskKey(next.localKey);
  const base = `.ai-workspace/tasks/${key}`;
  const history = `.ai-workspace/history/${key}`;
  if (previous) {
    const actual = readDossier(storage, key);
    if (previous.meta || actual.meta) fail("already_managed");
    if (actual.base !== base) fail("legacy_archive_requires_review");
    if (storage.exists(history)) fail("dossier_collision");
    if (actual.documentHash !== previous.documentHash || body !== previous.body)
      fail("document_conflict");
  } else if (storage.exists(base) || storage.exists(history))
    fail("dossier_collision");
  const file = `${base}/artifact-manifest.json`;
  if (storage.exists(file)) fail("artifact_manifest_exists");
  const manifest = workspaceArtifactManifestSchema.parse({
    schemaVersion: 1,
    localDossierId: next.localDossierId,
    revision: 1,
    artifacts: [],
  });
  const serialized = serializeDossier(next, body);
  return {
    dossier: {
      base,
      body,
      meta: next,
      documentHash: hashBytes(Buffer.from(serialized)),
      bodyHash: hashBytes(Buffer.from(body)),
    },
    manifest,
    absentPaths: [history],
    writes: [
      planWorkspaceFile(
        storage,
        file,
        JSON.stringify(manifest, null, 2) + "\n",
      ),
      planWorkspaceFile(storage, `${base}/TASK.md`, serialized),
    ],
  };
}
/**
 * Читает обязательный manifest managed-досье без подмены утраченного состояния.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./Dossier.types").WorkspaceDossier} dossier
 * @returns {import("./Dossier.types").WorkspaceArtifactManifest}
 */
export function readArtifacts(storage, dossier) {
  const meta = requireManaged(dossier);
  const file = `${dossier.base}/artifact-manifest.json`;
  if (!storage.exists(file)) fail("artifact_manifest_missing");
  const manifest = workspaceArtifactManifestSchema.parse(storage.json(file));
  if (manifest.localDossierId !== meta.localDossierId)
    fail("artifact_owner_mismatch");
  return manifest;
}
/**
 * Сохраняет точные TASK/manifest как проверяемые записи без изменения bytes.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("./Dossier.types").WorkspaceDossier} dossier
 */
export function planDossierReadGuards(storage, dossier) {
  const actual = readDossier(storage, requireManaged(dossier).localKey);
  if (
    actual.documentHash !== dossier.documentHash ||
    actual.base !== dossier.base
  )
    fail("document_conflict");
  readArtifacts(storage, actual);
  return ["TASK.md", "artifact-manifest.json"].map((name) => {
    const path = `${actual.base}/${name}`;
    return planWorkspaceFile(
      storage,
      path,
      storage.read(path, 32 * 1024 * 1024),
    );
  });
}

/**
 * Привязывает completed replay к тому же managed-досье, включая перенос между tasks/history.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} key
 * @param {string} localDossierId
 */
export function assertDossierIdentity(storage, key, localDossierId) {
  if (readDossier(storage, key).meta?.localDossierId !== localDossierId)
    fail("dossier_identity_mismatch");
}

/**
 * Фиксирует отсутствие второго TASK с тем же ключом до любого metadata effect восстановления.
 * @param {import("./Dossier.types").WorkspaceDossier} dossier
 */
export function dossierAbsenceGuards(dossier) {
  const key = safeTaskKey(requireManaged(dossier).localKey);
  const tasks = `.ai-workspace/tasks/${key}`;
  const history = `.ai-workspace/history/${key}`;
  if (dossier.base !== tasks && dossier.base !== history)
    fail("dossier_identity_mismatch");
  return [`${dossier.base === tasks ? history : tasks}/TASK.md`];
}
