/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerDeepLink.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Определяет порт защищённого открытия исторического выпуска по URL.
 */
import type { AIConfigurationArtifactLink } from "../RealizeAILinks.types";

export type AgentLayerDeepLinkOptions = {
  ready: boolean;
  busy: boolean;
  dirty: boolean;
  pending: boolean;
  openRelease: (
    id: string,
    artifact?: AIConfigurationArtifactLink,
  ) => Promise<boolean>;
};
