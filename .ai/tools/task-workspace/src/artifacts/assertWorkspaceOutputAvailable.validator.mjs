/**
 * @file .ai/tools/task-workspace/src/artifacts/assertWorkspaceOutputAvailable.validator.mjs
 * @version 1.0.1
 * @date 2026-10-15
 * @description Запрещает пересечение служебной записи с зарегистрированным деревом в обоих направлениях.
 * @see documentation/specifications/task-management-execution.md
 */
import { fail } from "../Workspace.error.mjs";
import { safeRelative } from "../filesystem/safeRelative.validator.mjs";

/**
 * Обычный служебный выход не получает права записи в чужой unsettled producer.
 * Владелец группы пишет свои outputs между begin и settle отдельным producer-путём.
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifactManifest} manifest
 * @param {readonly string[]} outputs
 * @param {string} errorCode
 */
export function assertWorkspaceOutputAvailable(manifest, outputs, errorCode) {
  for (const output of outputs) safeRelative(output);
  if (
    manifest.artifacts.some(
      (artifact) =>
        artifact.state === "ready" &&
        outputs.some(
          (output) =>
            output === artifact.path ||
            output.startsWith(artifact.path + "/") ||
            artifact.path.startsWith(output + "/"),
        ),
    )
  )
    fail(errorCode);
}
