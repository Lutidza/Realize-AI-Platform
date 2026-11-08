/**
 * @file packages/engineering-runtime/src/runtime/mapChangedArtifacts.mapper.ts
 * @version 1.0.0
 * @date 2026-10-28
 * @description Формирует публичный состав изменённых артефактов с последним hash каждого пути.
 * @see documentation/architecture/engineering-operations.md
 */
import type {
  OperationReceipt,
  PlannedEffect,
} from "./EngineeringResult.types.ts";

/** Tree rename задаёт полный состав; последующие metadata/consumer edits обновляют его hashes. */
export function mapChangedArtifacts(
  effects: readonly PlannedEffect[],
): NonNullable<OperationReceipt["changedArtifacts"]> {
  const artifacts = new Map<
    string,
    NonNullable<OperationReceipt["changedArtifacts"]>[number]
  >();
  for (const effect of effects) {
    if (effect.kind === "move" && effect.movedArtifacts) {
      for (const artifact of effect.movedArtifacts)
        artifacts.set(artifact.to, {
          path: artifact.to,
          kind: artifact.kind,
          sha256: artifact.sha256,
        });
    } else if (
      (effect.paths.length === 1 &&
        (typeof effect.contentSha256 === "string" ||
          effect.kind === "create_directory")) ||
      (effect.kind === "move" &&
        effect.paths.length === 2 &&
        typeof effect.contentSha256 === "string")
    ) {
      const path = effect.paths[effect.kind === "move" ? 1 : 0];
      artifacts.set(path, {
        path,
        kind: effect.kind === "create_directory" ? "directory" : "file",
        sha256: effect.contentSha256 ?? null,
      });
    }
  }
  return [...artifacts.values()];
}
