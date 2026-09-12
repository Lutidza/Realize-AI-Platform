/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerRelease.types.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Определяет отдельный цикл immutable выпуска и смены активного указателя.
 */
import type {
  ActiveAIConfigPointer,
  ActivateAIConfigReleaseInput,
  AIConfigBootstrapDTO,
  AIConfigDraftDTO,
  AIConfigReleaseDTO,
  AIConfigReleaseSummaryDTO,
  CreateAIConfigReleaseInput,
} from "@realize/ai-contracts";
import type { AgentLayerConfigurationAdapter } from "./AgentLayerConfiguration.adapter";
import type { AgentLayerConfigurationFailure } from "./AgentLayerConfiguration.types";
import type { AIConfigurationArtifactLink } from "../RealizeAILinks.types";

/** После неизвестного результата повторяется исходное тело; подтверждённая запись только перечитывается. */
export type AgentLayerReleaseMutation = (
  | {
      kind: "release";
      input: CreateAIConfigReleaseInput;
      receipt?: AIConfigReleaseSummaryDTO;
    }
  | {
      kind: "activate";
      input: ActivateAIConfigReleaseInput;
      receipt?: ActiveAIConfigPointer;
    }
) & { idempotencyKey: string };
export type AgentLayerReleaseMutationResult =
  | {
      kind: "release";
      bootstrap: AIConfigBootstrapDTO;
      release: AIConfigReleaseDTO;
      draft: AIConfigDraftDTO;
    }
  | {
      kind: "activate";
      bootstrap: AIConfigBootstrapDTO;
      receipt: ActiveAIConfigPointer;
    };
export type UseAgentLayerReleaseMutationOptions = {
  api: AgentLayerConfigurationAdapter;
  onStart: () => void;
  onFailure: (failure: AgentLayerConfigurationFailure) => void;
  onSuccess: (result: AgentLayerReleaseMutationResult) => void;
};
export type AgentLayerReleaseInspectorProps = {
  release: AIConfigReleaseDTO;
  initialArtifact?: AIConfigurationArtifactLink;
  bootstrap: AIConfigBootstrapDTO;
  disabled: boolean;
  onBack: () => void;
  onActivate: (action: "activate" | "rollback") => void;
};
