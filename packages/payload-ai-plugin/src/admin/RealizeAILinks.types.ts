/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAILinks.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Описывает адрес записи внутри исторического выпуска конфигурации.
 */
import type { AIConfigArtifactKind } from "@realize/ai-contracts";

export type AIConfigurationArtifactLink = {
  kind: AIConfigArtifactKind;
  key: string;
};

/** Ссылка всегда закреплена за выпуском, а не за текущим редактируемым черновиком. */
export type AIConfigurationDeepLink = {
  releaseID: string;
  artifact?: AIConfigurationArtifactLink;
};
