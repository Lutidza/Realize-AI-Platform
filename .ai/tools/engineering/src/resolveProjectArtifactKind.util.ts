/**
 * @file .ai/tools/engineering/src/resolveProjectArtifactKind.util.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Выбирает единственный зарегистрированный candidate kind для последующей проверки native profile.
 * @see documentation/architecture/engineering-artifacts.md
 */
import { SOURCE_ARTIFACT_PROFILES } from "./projectArtifactProfiles.config.ts";
import type {
  SupportedArtifactKind,
  SupportedSourceKind,
} from "./ProjectArtifactBinding.types.ts";

/** Kind не выдаёт допуск: содержимое и effective folder policy проверяет binding. */
export function resolveProjectArtifactKind(
  path: string,
): SupportedArtifactKind | null {
  for (const [kind, profile] of Object.entries(SOURCE_ARTIFACT_PROFILES))
    if (
      profile.extensions.some((extension) =>
        path.endsWith(`.${profile.role}.${extension}`),
      )
    )
      return kind as SupportedSourceKind;
  return /^\.ai\/templates\/.*\/TEMPLATE-[A-Z0-9-]+\.md$/.test(path)
    ? "ai.template"
    : null;
}
