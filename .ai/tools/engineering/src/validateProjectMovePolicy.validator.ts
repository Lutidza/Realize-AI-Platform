/**
 * @file .ai/tools/engineering/src/validateProjectMovePolicy.validator.ts
 * @version 1.1.0
 * @date 2026-10-30
 * @description Проверяет явную bounded policy полноты references и дату metadata от доверенного host.
 * @see documentation/architecture/engineering-operations.md
 */
import type { ProjectMovePolicy } from "./ProjectArtifactBinding.types.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import { assertArtifactPath } from "./resolveProjectFolderPolicy.validator.ts";

export function validateProjectMovePolicy(
  input: ProjectMovePolicy | undefined,
): ProjectMovePolicy | null {
  if (input === undefined) return null;
  if (
    !input ||
    Object.keys(input).some(
      (key) =>
        ![
          "changedOn",
          "coverage",
          "referenceRoots",
          "sourcePaths",
          "tsconfigWrite",
          "packageExportsWrite",
        ].includes(key),
    ) ||
    input.coverage !== "complete" ||
    typeof input.changedOn !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.changedOn) ||
    !Number.isFinite(Date.parse(input.changedOn)) ||
    new Date(input.changedOn).toISOString().slice(0, 10) !== input.changedOn
  )
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Move требует complete policy и явную календарную дату.",
    );
  for (const [paths, limit] of [
    [input.referenceRoots, 16],
    [input.sourcePaths, 128],
  ] as const) {
    if (
      !Array.isArray(paths) ||
      !paths.length ||
      paths.length > limit ||
      new Set(paths).size !== paths.length
    )
      throw new ProjectArtifactError(
        "LIMIT_EXCEEDED",
        "Move policy требует ограниченные непустые roots и sourcePaths.",
      );
    paths.forEach(assertArtifactPath);
  }
  if (input.tsconfigWrite !== undefined) {
    const write = input.tsconfigWrite;
    if (
      !write ||
      write.allConsumersInReferenceRoots !== true ||
      Object.keys(write).some(
        (key) =>
          ![
            "path",
            "allConsumersInReferenceRoots",
            "projectConfigPaths",
          ].includes(key),
      )
    )
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Config write требует явной полноты всех consumers.",
      );
    if (
      write.projectConfigPaths !== undefined &&
      (!Array.isArray(write.projectConfigPaths) ||
        !write.projectConfigPaths.length ||
        write.projectConfigPaths.length > 16 ||
        new Set(write.projectConfigPaths).size !==
          write.projectConfigPaths.length)
    )
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Project configs требуют от 1 до 16 уникальных точных путей.",
      );
    for (const path of [write.path, ...(write.projectConfigPaths ?? [])]) {
      assertArtifactPath(path);
      if (
        !path.endsWith(".json") ||
        input.referenceRoots.some(
          (root) => path === root || path.startsWith(root + "/"),
        )
      )
        throw new ProjectArtifactError(
          "UNSUPPORTED",
          "Config paths должны быть JSONC вне source inventory.",
        );
    }
  }
  if (input.packageExportsWrite !== undefined) {
    const write = input.packageExportsWrite;
    if (
      !write ||
      input.tsconfigWrite ||
      write.allConsumersInReferenceRoots !== true ||
      Object.keys(write).some(
        (key) =>
          !["path", "workspaceRoots", "allConsumersInReferenceRoots"].includes(
            key,
          ),
      ) ||
      !Array.isArray(write.workspaceRoots) ||
      !write.workspaceRoots.length ||
      write.workspaceRoots.length > 16 ||
      new Set(write.workspaceRoots).size !== write.workspaceRoots.length
    )
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Package exports write требует одного owner и полных ограниченных workspace roots, отдельно от tsconfigWrite.",
      );
    [write.path, ...write.workspaceRoots].forEach(assertArtifactPath);
    if (
      !write.path.endsWith("/package.json") ||
      !write.workspaceRoots.some((root) => write.path.startsWith(root + "/")) ||
      input.referenceRoots.some((root) => write.path.startsWith(root + "/"))
    )
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Package owner должен находиться в workspace inventory вне source roots.",
      );
  }
  return structuredClone(input);
}
