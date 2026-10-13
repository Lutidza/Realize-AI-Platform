/**
 * @file .ai/tools/task-workspace/src/beginWorkspaceProducerGroup.service.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Создаёт эксклюзивные output trees и регистрирует caller-controlled producers существующего managed-досье.
 * @see documentation/specifications/task-management-execution.md
 */
import { randomUUID } from "node:crypto";
import { workspaceArtifactManifestSchema } from "@realize/payload-task-manager/workspace-contracts";
import {
  registerWorkspaceArtifacts,
  validateWorkspaceArtifactPath,
} from "./registerWorkspaceArtifact.service.mjs";
import { readArtifacts, readDossier } from "./Dossier.repository.mjs";
import { withWorkspaceLock } from "./withWorkspaceLock.adapter.mjs";
import { fail } from "./Workspace.error.mjs";
import {
  bindProducerGroup,
  requireProducerDossier,
} from "./workspaceProducerGroup.validator.mjs";
import {
  createProducerDirectories,
  rollbackProducerDirectories,
} from "./workspaceProducerDirectories.adapter.mjs";

/**
 * Не создаёт/adopt/status досье. Возвращаемый process-local handle передаётся в finalize без сериализации.
 * @param {import("./WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {string} key
 * @param {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroupInput} input
 * @returns {import("./WorkspaceProducerGroup.types.ts").WorkspaceProducerGroup}
 */
export function beginWorkspaceProducerGroup(storage, key, input) {
  if (
    !input ||
    Object.keys(input).some(
      (name) => !["stageId", "attemptId", "artifacts"].includes(name),
    ) ||
    !Array.isArray(input.artifacts) ||
    !input.artifacts.length ||
    input.artifacts.length > 1024
  )
    fail("invalid_producer_group");
  const producerId = `group:${randomUUID()}`;
  const artifacts = input.artifacts.map((artifact) => {
    if (
      !artifact ||
      Object.keys(artifact).some(
        (name) => !["path", "category", "retention"].includes(name),
      )
    )
      fail("invalid_producer_group");
    validateWorkspaceArtifactPath(artifact);
    return {
      ...artifact,
      stageId: input.stageId ?? null,
      attemptId: input.attemptId ?? null,
      producer: { id: producerId, pid: null, settled: false },
      retention: artifact.retention ?? {
        mode: artifact.category === "temporary" ? "temporary" : "retain",
        pinned: false,
        keepReason: null,
        referencedBy: [],
      },
    };
  });
  const paths = artifacts.map((artifact) => artifact.path);
  if (
    new Set(paths).size !== paths.length ||
    paths.some((a) => paths.some((b) => a !== b && b.startsWith(a + "/")))
  )
    fail("overlapping_producer_paths");
  const created = [];
  let dossier;
  try {
    dossier = withWorkspaceLock(storage, key, () => {
      const current = requireProducerDossier(storage, key);
      // Проверяем schema до mkdir; итоговые IDs/hash/bytes назначает штатный register.
      workspaceArtifactManifestSchema.parse({
        schemaVersion: 1,
        localDossierId: current.meta.localDossierId,
        revision: 1,
        artifacts: artifacts.map((artifact) => ({
          ...artifact,
          id: randomUUID(),
          revision: 1,
          bytes: 0,
          hash: "0".repeat(64),
          state: "ready",
          createdAt: new Date().toISOString(),
          producer: { ...artifact.producer, identity: null },
        })),
      });
      if (
        artifacts.some(
          (artifact) =>
            artifact.category !== "temporary" &&
            artifact.retention.mode === "temporary",
        )
      )
        fail("retained_category_requires_retain");
      const manifest = readArtifacts(storage, current);
      for (const artifact of artifacts)
        validateWorkspaceArtifactPath(artifact, manifest);
      createProducerDirectories(storage, current.base, paths, created);
      return current;
    });
    const registered = registerWorkspaceArtifacts(
      storage,
      key,
      dossier.meta.revision,
      { artifacts },
    );
    return withWorkspaceLock(storage, key, () => {
      const current = requireProducerDossier(storage, key, registered.revision);
      const records = readArtifacts(storage, current).artifacts.filter(
        (artifact) => artifact.producer.id === producerId,
      );
      if (
        records.length !== artifacts.length ||
        records.some((artifact) => !paths.includes(artifact.path))
      )
        fail("producer_group_metadata_changed");
      return bindProducerGroup(
        current,
        input,
        paths.map((relative) =>
          records.find((artifact) => artifact.path === relative),
        ),
      );
    });
  } catch (error) {
    // register может успеть записать manifest до TASK CAS; такие outputs сохраняются даже пустыми.
    if (created.length) {
      try {
        error.rollback = withWorkspaceLock(storage, key, () => {
          const current = readDossier(storage, key);
          if (!current.meta) fail("legacy_requires_adoption");
          const ready = readArtifacts(storage, current).artifacts.filter(
            (artifact) => artifact.state === "ready",
          );
          const retained = created.filter((entry) =>
            ready.some((artifact) => {
              const registered = `${current.base}/${artifact.path}`;
              return (
                registered === entry.path ||
                registered.startsWith(entry.path + "/") ||
                entry.path.startsWith(registered + "/")
              );
            }),
          );
          const rollback = rollbackProducerDirectories(
            storage,
            created.filter((entry) => !retained.includes(entry)),
          );
          rollback.preserved.push(
            ...retained.map((entry) => ({
              path: entry.path,
              reason: "artifact_registered",
            })),
          );
          return rollback;
        });
      } catch (inspectionError) {
        error.rollback = {
          removed: [],
          preserved: created.map((entry) => ({
            path: entry.path,
            reason: inspectionError.code ?? "inspection_failed",
          })),
        };
      }
    }
    throw error;
  }
}
