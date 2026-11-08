/**
 * @file packages/engineering-runtime/src/filesystem/prepareDirectoryFilesystemMove.service.ts
 * @version 1.1.0
 * @date 2026-10-29
 * @description Готовит один exact-tree rename и metadata/consumer edits с полным публичным набором путей.
 * @see documentation/architecture/engineering-operations.md
 */
import type {
  ArtifactDescriptorPort,
  ArtifactInventoryPort,
} from "../artifacts/ArtifactDescriptor.types.ts";
import type { DescriptorFilesystem } from "./DescriptorFilesystem.adapter.ts";
import type { PreparedDirectoryFilesystemMove } from "./EngineeringFilesystem.types.ts";
import type { PlannedEffect } from "../runtime/EngineeringResult.types.ts";
import { readFilesystemTree } from "./readFilesystemTree.service.ts";
import { buildFilesystemDiff } from "./buildFilesystemDiff.util.ts";
import {
  foldedName,
  isCaseOnlySiblingRename,
} from "./creationManifest.service.ts";
import { sha256Bytes } from "../contracts/hashEngineeringValue.util.ts";
import { failure } from "../runtime/EngineeringFailure.error.ts";

export function prepareDirectoryFilesystemMove(
  checkout: DescriptorFilesystem,
  descriptors: ArtifactDescriptorPort,
  from: string,
  to: string,
  expectedVersion: string,
  inventory: ArtifactInventoryPort,
): PreparedDirectoryFilesystemMove {
  if (
    from === to ||
    from.startsWith(to + "/") ||
    to.startsWith(from + "/") ||
    (foldedName(from) === foldedName(to) && !isCaseOnlySiblingRename(from, to))
  )
    failure(
      "CONFLICT",
      "Directory move не допускает ancestor/self или неоднозначное folded пересечение.",
    );
  if (!descriptors.prepareDirectoryMove)
    failure("UNSUPPORTED", "Directory move resolver не подключён.");
  const tree = readFilesystemTree(checkout, from);
  if (tree.version !== expectedVersion)
    failure("CONFLICT", "Полная исходная версия дерева изменилась.");
  const root = tree.entries.find((entry) => entry.path === from)!;
  const directoryPaths = tree.entries
    .filter((entry) => entry.identity!.kind === "directory")
    .map((entry) => entry.path);
  const filePaths = tree.entries
    .filter((entry) => entry.identity!.kind === "file")
    .map((entry) => entry.path);
  const result = descriptors.prepareDirectoryMove(
    { from, to, directories: directoryPaths, files: filePaths },
    inventory,
  );
  if (
    JSON.stringify(result.directories.map((item) => item.from).sort()) !==
      JSON.stringify(directoryPaths.sort()) ||
    JSON.stringify(
      result.files
        .filter((item) => item.from !== item.path)
        .map((item) => item.from)
        .sort(),
    ) !== JSON.stringify(filePaths.sort())
  )
    failure(
      "CONFLICT",
      "Binding не подтвердил весь состав перемещаемого дерева.",
    );
  const planned: PreparedDirectoryFilesystemMove = {
    inputs: [
      {
        path: to,
        fromPath: from,
        kind: "move",
        index: 0,
        bytes: null,
        sourceIdentity: root.identity!,
      },
    ],
    effects: [],
    descriptors: [],
    trackedPaths: [...result.readPaths],
    sourceEntries: tree.entries,
  };
  const movedArtifacts = tree.entries.map((entry) => ({
    from: entry.path,
    to: to + entry.path.slice(from.length),
    kind: entry.identity!.kind,
    sha256: entry.identity!.sha256,
  }));
  planned.effects.push({
    kind: "move",
    paths: movedArtifacts.flatMap((item) => [item.from, item.to]),
    description: `Перенести каталог и ${tree.entries.length - 1} потомков`,
    contentSha256: null,
    diff: null,
    movedArtifacts,
  });
  for (const directory of result.directories) {
    if (
      directory.to !== to + directory.from.slice(from.length) ||
      directory.source.ownerRef !== directory.destination.ownerRef
    )
      failure("FORBIDDEN", "Directory mapping меняет owner или destination.");
    planned.descriptors.push(directory.source, directory.destination);
  }
  for (const entry of tree.entries)
    planned.trackedPaths.push(entry.path, to + entry.path.slice(from.length));
  const consumed = new Set<string>(),
    destinations = new Set<string>();
  let diffBytes = 0;
  for (const edit of [...result.files].sort(
    (a, b) =>
      Number(a.from === a.path) - Number(b.from === b.path) ||
      (a.from < b.from ? -1 : a.from > b.from ? 1 : 0),
  )) {
    const expectedPath =
      edit.from === from || edit.from.startsWith(from + "/")
        ? to + edit.from.slice(from.length)
        : edit.from;
    if (
      edit.path !== expectedPath ||
      consumed.has(edit.from) ||
      destinations.has(edit.path)
    )
      failure(
        "CONFLICT",
        "Некорректный или повторный directory dependent edit.",
      );
    consumed.add(edit.from);
    destinations.add(edit.path);
    const entry =
        tree.entries.find((value) => value.path === edit.from) ??
        checkout.entry(edit.from),
      original = checkout.read(edit.from);
    if (
      entry.identity?.kind !== "file" ||
      entry.identity.sha256 !== edit.expectedSha256 ||
      sha256Bytes(original) !== edit.expectedSha256
    )
      failure("CONFLICT", "Исходная версия tree dependent edit изменилась.");
    const source =
      descriptors.resolveExistingFile?.({
        path: edit.from,
        content: original,
        ...(edit.from === edit.path
          ? { purpose: "dependent_edit" as const }
          : {}),
      }) ??
      descriptors.resolveFile({
        path: edit.from,
        artifactKind: edit.descriptor.kindId,
        content: original,
      });
    if (
      source.ownerRef !== edit.descriptor.ownerRef ||
      source.kindId !== edit.descriptor.kindId
    )
      failure("FORBIDDEN", "Dependent edit меняет owner.");
    planned.descriptors.push(source, edit.descriptor);
    planned.trackedPaths.push(edit.from, edit.path);
    if (sha256Bytes(edit.content) === edit.expectedSha256) continue;
    const diff = buildFilesystemDiff(edit.path, original, edit.content);
    diffBytes += Buffer.byteLength(diff);
    if (diffBytes > 128 * 1024)
      failure("LIMIT_EXCEEDED", "Tree preview превышает 128 KiB.");
    planned.inputs.push({
      path: edit.path,
      kind: "edit_file",
      index: planned.inputs.length,
      bytes: edit.content,
      sourceIdentity: entry.identity,
      mode: entry.identity.mode,
    });
    planned.effects.push({
      kind: "edit_file",
      paths: [edit.path],
      description:
        edit.from === edit.path
          ? "Обновить references внешнего consumer"
          : "Согласовать metadata и references перенесённого файла",
      diff,
      contentSha256: sha256Bytes(edit.content),
    } satisfies PlannedEffect);
  }
  return planned;
}
