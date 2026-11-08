/**
 * @file .ai/tools/engineering/src/prepareProjectDirectoryMove.service.ts
 * @version 1.1.0
 * @date 2026-10-29
 * @description Проверяет owner boundaries дерева и готовит общий набор moved artifacts и consumer edits.
 * @see documentation/architecture/engineering-operations.md
 */
import { posix } from "node:path";
import { sha256Bytes } from "@realize/engineering-runtime";
import type {
  ArtifactDirectoryMoveInput,
  ArtifactInventoryPort,
  ResolvedArtifactDirectoryMove,
} from "@realize/engineering-runtime";
import type { ProjectDirectoryMoveOptions } from "./ProjectArtifactMove.types.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import { mapMovedArtifactPath } from "./mapMovedArtifactPath.util.ts";
import { prepareProjectArtifactRelocation } from "./prepareProjectArtifactRelocation.service.ts";

export function prepareProjectDirectoryMove(
  input: ArtifactDirectoryMoveInput,
  inventory: ArtifactInventoryPort,
  options: ProjectDirectoryMoveOptions,
): ResolvedArtifactDirectoryMove {
  const { policy, resolveExistingDirectory } = options;
  if (
    !policy ||
    policy.referenceRoots.some(
      (root) =>
        mapMovedArtifactPath(root, input.from, input.to) !== root ||
        root === input.to ||
        root.startsWith(input.to + "/"),
    )
  )
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Directory move требует неизменных complete reference roots.",
    );
  const paths = [...input.directories, ...input.files];
  if (
    !input.directories.includes(input.from) ||
    paths.length > 32 ||
    new Set(paths).size !== paths.length ||
    paths.some(
      (path) => path !== input.from && !path.startsWith(input.from + "/"),
    )
  )
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Нужен полный bounded состав исходного дерева.",
    );
  const owner = resolveExistingDirectory(input.from).ownerRef;
  const directories = [...input.directories].sort().map((from) => {
    const to = mapMovedArtifactPath(from, input.from, input.to);
    options.assertMoveBoundary(from, to);
    if (!/^[a-z][a-z0-9-]*$/.test(posix.basename(to)))
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Directory move сохраняет kebab-case имена каталогов.",
      );
    const source = resolveExistingDirectory(from),
      destination = resolveExistingDirectory(to);
    for (const descriptor of [source, destination]) {
      if (descriptor.ownerRef !== owner)
        throw new ProjectArtifactError(
          "UNSUPPORTED",
          "Directory move не пересекает owner boundaries.",
        );
      if (
        descriptor.requiredCheckRefs.some(
          (check) => !descriptor.validatedChecks.includes(check),
        )
      )
        throw new ProjectArtifactError(
          "UNSUPPORTED",
          "Обязательные directory checks не подключены.",
        );
    }
    return { from, to, source, destination };
  });
  const result = prepareProjectArtifactRelocation(input, inventory, options);
  const files = result.candidates
    .filter(
      (candidate) =>
        candidate.path !== candidate.finalPath ||
        sha256Bytes(candidate.original) !== sha256Bytes(candidate.content),
    )
    .map((candidate) => {
      if (
        candidate.path !== candidate.finalPath &&
        candidate.descriptor.ownerRef !== owner
      )
        throw new ProjectArtifactError(
          "UNSUPPORTED",
          "Дерево содержит отдельного владельца файла.",
        );
      return {
        from: candidate.path,
        path: candidate.finalPath,
        expectedSha256: sha256Bytes(candidate.original),
        content: candidate.content,
        descriptor: candidate.descriptor,
      };
    });
  return {
    files,
    directories,
    readPaths: [
      ...new Set([
        ...result.readPaths,
        ...directories.flatMap((directory) => [
          ...directory.source.readPaths,
          ...directory.destination.readPaths,
        ]),
      ]),
    ].sort(),
  };
}
