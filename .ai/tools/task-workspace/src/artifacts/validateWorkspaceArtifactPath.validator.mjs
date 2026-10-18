/**
 * @file .ai/tools/task-workspace/src/artifacts/validateWorkspaceArtifactPath.validator.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Проверяет категорию пути артефакта и отсутствие пересечения с зарегистрированными деревьями.
 * @see documentation/specifications/task-management-execution.md
 */
import { safeRelative } from "../filesystem/safeRelative.validator.mjs";
import { fail } from "../Workspace.error.mjs";

const prefixes = {
  reference: "references/",
  screenshot: "screenshots/",
  snapshot: "snapshots/",
  log: "logs/",
  draft: "drafts/",
  result: "logs/results/",
  temporary: "tmp/",
};

/**
 * Проверка пути не читает дерево и применима до создания producer-каталогов.
 * @param {Pick<import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifact, "path" | "category">} item
 * @param {import("@realize/payload-task-manager/workspace-contracts").WorkspaceArtifactManifest} [manifest]
 */
export function validateWorkspaceArtifactPath(item, manifest) {
  safeRelative(item.path);
  if (
    !prefixes[item.category] ||
    !item.path.startsWith(prefixes[item.category]) ||
    /(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|sqlite|sqlite3|dump)$/.test(item.path)
  )
    fail("protected_artifact_path");
  if (
    manifest?.artifacts.some(
      (artifact) =>
        artifact.state === "ready" &&
        (artifact.path === item.path ||
          artifact.path.startsWith(item.path + "/") ||
          item.path.startsWith(artifact.path + "/")),
    )
  )
    fail("artifact_already_registered");
}
