/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/createAgentLayerArtifactCopyIdentity.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Подбирает ограниченные по длине ключ и название копии с учётом точного вида записи.
 */

import type { AIConfigArtifact } from "@realize/ai-contracts";

/** Коллизия ключа в другом виде не мешает копированию; helper не выполняет запись. */
export const createAgentLayerArtifactCopyIdentity = (
  source: Pick<AIConfigArtifact, "kind" | "key" | "title">,
  artifacts: readonly AIConfigArtifact[],
): Pick<AIConfigArtifact, "key" | "title"> => {
  const existingKeys = new Set(
    artifacts
      .filter((item) => item.kind === source.kind)
      .map((item) => item.key),
  );
  let ordinal = 1;
  let key: string;
  do {
    const suffix = ordinal === 1 ? ".copy" : `.copy-${ordinal}`;
    key = `${source.key.slice(0, 128 - suffix.length)}${suffix}`;
    ordinal++;
  } while (existingKeys.has(key));
  const titleSuffix = " (копия)";
  return {
    key,
    title: `${source.title.slice(0, 120 - titleSuffix.length)}${titleSuffix}`,
  };
};
