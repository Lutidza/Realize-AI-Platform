/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/parseAgentLayerDeepLink.validator.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет ссылку на выпуск и конкретную запись без перехода к текущему черновику.
 */
import type { AIConfigArtifactKind } from "@realize/ai-contracts";
import type { AIConfigurationDeepLink } from "../RealizeAILinks.types";
import { readAIRecordLinkID } from "../realizeAILinks.util";
import { AGENT_LAYER_KIND_LABELS } from "./agentLayerPresentation.util";

export const parseAgentLayerDeepLink = (
  query: URLSearchParams,
): AIConfigurationDeepLink | undefined => {
  const releaseID = readAIRecordLinkID(query, "release");
  const key = readAIRecordLinkID(query, "key");
  const kinds = query.getAll("kind");
  if (!releaseID && !key && !kinds.length) return undefined;
  if (!releaseID || kinds.length > 1 || Boolean(key) !== Boolean(kinds.length))
    throw new Error(
      "Ссылка на запись должна содержать выпуск, вид и ключ записи.",
    );
  if (!key) return { releaseID };
  const kind = kinds[0];
  if (!Object.hasOwn(AGENT_LAYER_KIND_LABELS, kind))
    throw new Error("В ссылке указан неизвестный вид записи.");
  return { releaseID, artifact: { kind: kind as AIConfigArtifactKind, key } };
};
