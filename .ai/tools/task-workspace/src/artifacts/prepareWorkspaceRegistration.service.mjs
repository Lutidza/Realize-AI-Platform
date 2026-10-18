/**
 * @file .ai/tools/task-workspace/src/artifacts/prepareWorkspaceRegistration.service.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Подготавливает регистрацию артефактов на явных снимках до записи общего журнала.
 * @see documentation/specifications/task-management-execution.md
 */
import { requireManaged } from "../dossier/Dossier.repository.mjs";
import { fail } from "../Workspace.error.mjs";
import { prepareWorkspaceArtifacts } from "./prepareWorkspaceArtifacts.service.mjs";
/**
 * Подготавливает metadata регистрации на явных снимках без записи и без изменения аргументов.
 * @param {import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs} storage
 * @param {import("../dossier/Dossier.types").WorkspaceDossier} dossier
 * @param {import("../dossier/Dossier.types").WorkspaceArtifactManifest} sourceManifest
 * @param {import("./WorkspaceArtifacts.types").WorkspaceArtifactRegistrationInput} input
 * @param {import("./WorkspaceArtifacts.types").WorkspaceArtifactPreparationOptions & {now: string}} options
 */
export function prepareWorkspaceRegistration(
  storage,
  dossier,
  sourceManifest,
  input,
  options,
) {
  if (
    !input ||
    Object.keys(input).some((name) => name !== "artifacts") ||
    !Array.isArray(input.artifacts) ||
    !input.artifacts.length ||
    input.artifacts.length > 1024
  )
    fail("invalid_registration");
  const meta = structuredClone(requireManaged(dossier));
  if (meta.archivedAt || meta.status.category === "closed")
    fail("reopen_required");
  if (sourceManifest.localDossierId !== meta.localDossierId)
    fail("artifact_owner_mismatch");
  const manifest = structuredClone(sourceManifest);
  manifest.artifacts.push(
    ...prepareWorkspaceArtifacts(
      storage,
      dossier,
      manifest,
      input.artifacts,
      options,
    ),
  );
  manifest.revision++;
  meta.revision++;
  meta.updatedAt = options.now;
  return { meta, manifest };
}
