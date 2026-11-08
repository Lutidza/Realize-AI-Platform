/**
 * @file .ai/tools/engineering/src/prepareProjectArtifactRelocation.service.ts
 * @version 1.1.1
 * @date 2026-10-30
 * @description Готовит перенос и dependent edits в полной host-области с проверкой финальных виртуальных артефактов.
 * @see documentation/architecture/engineering-operations.md
 */
import { posix } from "node:path";
import { sha256Bytes } from "@realize/engineering-runtime";
import type {
  ArtifactMoveInput,
  ArtifactInventoryPort,
  ArtifactDirectoryMoveInput,
} from "@realize/engineering-runtime";
import type {
  ArtifactMoveCandidate,
  ProjectArtifactMoveOptions,
  ProjectArtifactRelocation,
} from "./ProjectArtifactMove.types.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import {
  ARTIFACT_LIMITS,
  MOVE_SOURCE_PATHS,
} from "./projectArtifactProfiles.config.ts";
import { assertArtifactPath } from "./resolveProjectFolderPolicy.validator.ts";
import { createSourceMoveResolver } from "./createSourceMoveResolver.service.ts";
import { rewriteSourceMove } from "./rewriteSourceMove.util.ts";
import { rewriteTemplateMove } from "./rewriteTemplateMove.util.ts";
import { mapMovedArtifactPath } from "./mapMovedArtifactPath.util.ts";
import { resolveProjectArtifactKind } from "./resolveProjectArtifactKind.util.ts";

/** Полнота ограничена explicit roots; неизвестные файлы не исключаются из поиска молча. */
export function prepareProjectArtifactRelocation(
  input: ArtifactMoveInput | ArtifactDirectoryMoveInput,
  inventory: ArtifactInventoryPort,
  options: ProjectArtifactMoveOptions,
): ProjectArtifactRelocation {
  const { policy, readReference, resolveFile } = options;
  if (!policy)
    throw new ProjectArtifactError(
      "UNSUPPORTED",
      "Project move не имеет complete host policy.",
    );
  for (const path of [input.from, input.to]) {
    assertArtifactPath(path);
    if (!policy.referenceRoots.some((root) => path.startsWith(root + "/")))
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Оба пути move должны находиться в подтверждённой области references.",
      );
  }
  const paths = [...inventory.files(policy.referenceRoots)];
  const expectedFiles =
    "files" in input ? [...input.files].sort() : [input.from];
  const movedPaths = paths
    .filter((path) => path === input.from || path.startsWith(input.from + "/"))
    .sort();
  if (
    JSON.stringify(movedPaths) !== JSON.stringify(expectedFiles) ||
    paths.some(
      (path) => path === input.to || path.startsWith(input.to + "/"),
    ) ||
    paths.length > 128 ||
    new Set(paths).size !== paths.length
  )
    throw new ProjectArtifactError(
      "CONFLICT",
      "Move не совпадает с закрытым inventory.",
    );
  const files = new Set(paths),
    readPaths = new Set<string>();
  const referenceCache = new Map<string, Uint8Array>();
  const absent = new Set<string>();
  let bytesRead = 0;
  const read = (path: string) => {
    assertArtifactPath(path);
    if (referenceCache.has(path)) return referenceCache.get(path)!;
    if (absent.has(path))
      throw Object.assign(new Error("Reference отсутствует."), {
        code: "ENOENT",
      });
    readPaths.add(path);
    let bytes: Uint8Array;
    try {
      bytes = readReference(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") absent.add(path);
      throw error;
    }
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.byteLength > ARTIFACT_LIMITS.referenceBytes
    )
      throw new ProjectArtifactError(
        "LIMIT_EXCEEDED",
        "Превышен размер move reference.",
      );
    bytesRead += bytes.byteLength;
    if (bytesRead > ARTIFACT_LIMITS.totalReferenceBytes)
      throw new ProjectArtifactError(
        "LIMIT_EXCEEDED",
        "Превышен общий бюджет move references.",
      );
    referenceCache.set(path, bytes);
    return bytes;
  };
  [...policy.sourcePaths, ...MOVE_SOURCE_PATHS].forEach(read);
  const resolution = createSourceMoveResolver({
    files,
    from: input.from,
    to: input.to,
    referenceRoots: policy.referenceRoots,
    readReference: read,
    readPaths,
    tsconfigWrite: policy.tsconfigWrite,
    packageExportsWrite: policy.packageExportsWrite,
    workspaceDirectories: inventory.directories
      ? (path, limit) => inventory.directories!(path, limit)
      : undefined,
  });
  const { resolveReference } = resolution;
  const candidates: ArtifactMoveCandidate[] = paths.sort().map((path) => {
    assertArtifactPath(path);
    const original = read(path);
    const kind = resolveProjectArtifactKind(path);
    if (!kind)
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Inventory содержит неизвестный artifact kind.",
      );
    const descriptor = resolveFile(
      { path, artifactKind: kind, content: original },
      read,
      options.templateIds,
    );
    if (
      descriptor.requiredCheckRefs.some(
        (check) => !descriptor.validatedChecks.includes(check),
      )
    )
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Обязательные checks inventory не подключены.",
      );
    if (
      "content" in input &&
      path === input.from &&
      (kind !== input.artifactKind ||
        sha256Bytes(original) !== sha256Bytes(input.content))
    )
      throw new ProjectArtifactError(
        "CONFLICT",
        "Исходный artifact изменился во время подготовки move.",
      );
    const finalPath = mapMovedArtifactPath(path, input.from, input.to);
    options.assertMoveBoundary(path, finalPath);
    let source: string;
    try {
      source = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(original);
    } catch {
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Move поддерживает UTF-8 artifacts.",
      );
    }
    const context = {
      path,
      finalPath,
      source,
      from: input.from,
      to: input.to,
      files,
      changedOn: policy.changedOn,
      resolveReference,
    };
    const result =
      kind === "ai.template"
        ? rewriteTemplateMove(context)
        : rewriteSourceMove(context);
    return {
      path,
      finalPath,
      kind,
      original,
      content: Buffer.from(result, "utf8"),
    };
  });
  candidates.push(...resolution.configEdits);
  const virtual = new Map(
    candidates.map((candidate) => [candidate.finalPath, candidate.content]),
  );
  const finalReader = (path: string) => {
    if (path === input.from || path.startsWith(input.from + "/"))
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Финальный reference указывает на прежний путь.",
      );
    return virtual.get(path) ?? read(path);
  };
  const ids = new Map(
    options.templateIds.map((entry) => [
      mapMovedArtifactPath(entry.path, input.from, input.to),
      mapMovedArtifactPath(entry.path, input.from, input.to) !== entry.path
        ? posix.basename(
            mapMovedArtifactPath(entry.path, input.from, input.to),
            ".md",
          )
        : entry.id,
    ]),
  );
  for (const candidate of candidates)
    if (candidate.kind === "ai.template")
      ids.set(candidate.finalPath, posix.basename(candidate.finalPath, ".md"));
  const templateIds = [...ids].map(([path, id]) => ({ path, id }));
  const resolved = candidates.map((candidate) => {
    const descriptor = resolveFile(
      {
        path: candidate.finalPath,
        artifactKind: candidate.kind,
        content: candidate.content,
      },
      finalReader,
      templateIds,
    );
    const old = resolveFile(
      {
        path: candidate.path,
        artifactKind: candidate.kind,
        content: candidate.original,
      },
      read,
      options.templateIds,
    );
    if (descriptor.ownerRef !== old.ownerRef)
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Move не может менять owner.",
      );
    if (
      descriptor.requiredCheckRefs.some(
        (check) => !descriptor.validatedChecks.includes(check),
      )
    )
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Не подключены проверки финальных artifacts.",
      );
    return { ...candidate, descriptor };
  });
  return { candidates: resolved, readPaths: [...readPaths].sort() };
}
