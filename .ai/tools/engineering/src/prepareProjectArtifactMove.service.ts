/**
 * @file .ai/tools/engineering/src/prepareProjectArtifactMove.service.ts
 * @version 1.1.0
 * @date 2026-10-28
 * @description Проецирует общий relocation resolver в контракт переноса одного authored-файла.
 * @see documentation/architecture/engineering-operations.md
 */
import { sha256Bytes } from "@realize/engineering-runtime";
import type {
  ArtifactMoveInput,
  ArtifactInventoryPort,
  ResolvedArtifactMove,
} from "@realize/engineering-runtime";
import type { ProjectArtifactMoveOptions } from "./ProjectArtifactMove.types.ts";
import { prepareProjectArtifactRelocation } from "./prepareProjectArtifactRelocation.service.ts";

export function prepareProjectArtifactMove(
  input: ArtifactMoveInput,
  inventory: ArtifactInventoryPort,
  options: ProjectArtifactMoveOptions,
): ResolvedArtifactMove {
  const result = prepareProjectArtifactRelocation(input, inventory, options);
  const moved = result.candidates.find(
    (candidate) => candidate.path === input.from,
  )!;
  return {
    content: moved.content,
    descriptor: moved.descriptor,
    readPaths: result.readPaths,
    edits: result.candidates
      .filter(
        (candidate) =>
          candidate.path !== input.from &&
          sha256Bytes(candidate.original) !== sha256Bytes(candidate.content),
      )
      .map((candidate) => ({
        path: candidate.path,
        expectedSha256: sha256Bytes(candidate.original),
        content: candidate.content,
        descriptor: candidate.descriptor,
      })),
  };
}
