/**
 * @file packages/payload-ai-plugin/src/admin/realizeAILinks.util.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Строит внутренние ссылки на диалог и записи исторического выпуска.
 */
import type { AIConfigurationArtifactLink } from "./RealizeAILinks.types";

/** Базовый URL принадлежит route owner; значения query кодируются отдельно. */
export const buildAIConversationURL = (
  chatURL: string,
  conversationID: string,
): string =>
  `${chatURL.replace(/\/$/, "")}?${new URLSearchParams({ conversation: conversationID })}`;

export const buildAIConfigurationURL = (
  settingsURL: string,
  releaseID: string,
  artifact?: AIConfigurationArtifactLink,
): string => {
  const query = new URLSearchParams({ release: releaseID });
  if (artifact) {
    query.set("kind", artifact.kind);
    query.set("key", artifact.key);
  }
  return `${settingsURL.replace(/\/$/, "")}?${query}`;
};

/** Повторённый или неполный идентификатор не становится запросом к API. */
export const readAIRecordLinkID = (
  query: Pick<URLSearchParams, "getAll">,
  key: string,
): string | undefined => {
  const values = query.getAll(key);
  if (!values.length) return undefined;
  if (
    values.length !== 1 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(values[0])
  )
    throw new Error("Ссылка содержит некорректный идентификатор.");
  return values[0];
};
