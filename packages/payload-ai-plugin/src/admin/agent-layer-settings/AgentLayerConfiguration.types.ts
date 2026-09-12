/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerConfiguration.types.ts
 * @version 1.5.0
 * @date 2026-09-10
 * @description Определяет клиентский контракт редакторов записей installation-слоя.
 */
import type {
  AIConfigBootstrapDTO,
  AIConfigDraftDTO,
  AIConfigDraftSummaryDTO,
  AIConfigValidationDTO,
  AIConfigReleaseDTO,
  AIAgentProfileDefinition,
  AILocalRuleDefinition,
  CreateAIConfigDraftInput,
  UpdateAIConfigDraftInput,
  ValidateAIConfigDraftInput,
} from "@realize/ai-contracts";
import type { AgentLayerInstructionInput } from "./AgentLayerInstruction.types";
import type { AgentLayerBindingInput } from "./AgentLayerBinding.types";
import type { AgentLayerWorkflowInput } from "./AgentLayerWorkflow.types";

export type AgentLayerRuleInput = Pick<
  AILocalRuleDefinition,
  "key" | "title" | "instruction" | "priority" | "enabled"
>;
/** Форма задаёт содержимое профиля; вид и монотонную ревизию назначает mapper. */
export type AgentLayerProfileInput = Omit<
  AIAgentProfileDefinition,
  "kind" | "revision"
>;
export type AgentLayerRuleReference = {
  kind: "agent_profile";
  key: string;
  title: string;
};
export type AgentLayerConfigurationErrorKind =
  "conflict" | "network" | "forbidden" | "validation" | "unknown";
export type AgentLayerConfigurationFailure = {
  kind: AgentLayerConfigurationErrorKind;
  message: string;
  retryable: boolean;
};
export type CreateAgentLayerDraftOptions = { copySelected?: boolean };

/** Незавершённая запись сохраняет точные body/key; чтение receipt не создаёт новую запись. */
export type AgentLayerMutation = (
  | {
      kind: "create";
      input: CreateAIConfigDraftInput;
      receipt?: AIConfigDraftSummaryDTO;
    }
  | {
      kind: "update";
      input: UpdateAIConfigDraftInput;
      receipt?: AIConfigDraftSummaryDTO;
    }
  | {
      kind: "validate";
      input: ValidateAIConfigDraftInput;
      receipt?: AIConfigValidationDTO;
    }
) & { draftID: string; idempotencyKey: string };

export type UseAgentLayerConfigurationResult = {
  release?: AIConfigReleaseDTO;
  openRelease: (id: string) => Promise<boolean>;
  createRelease: () => Promise<boolean>;
  activateRelease: (action: "activate" | "rollback") => Promise<boolean>;
  bootstrap?: AIConfigBootstrapDTO;
  draft?: AIConfigDraftDTO;
  rules: readonly AILocalRuleDefinition[];
  isLoading: boolean;
  isBusy: boolean;
  error?: string;
  errorKind?: AgentLayerConfigurationErrorKind;
  notice?: string;
  validation?: AIConfigValidationDTO;
  hasPendingMutation: boolean;
  refresh: () => Promise<boolean>;
  selectDraft: (id: string) => Promise<boolean>;
  createDraft: (options?: CreateAgentLayerDraftOptions) => Promise<boolean>;
  saveRule: (
    input: AgentLayerRuleInput,
    originalKey?: string,
  ) => Promise<boolean>;
  saveProfile: (
    input: AgentLayerProfileInput,
    originalKey?: string,
  ) => Promise<boolean>;
  saveInstruction: (
    input: AgentLayerInstructionInput,
    originalKey?: string,
  ) => Promise<boolean>;
  saveBinding: (
    input: AgentLayerBindingInput,
    originalKey?: string,
  ) => Promise<boolean>;
  removeRule: (key: string) => Promise<boolean>;
  saveWorkflow: (
    input: AgentLayerWorkflowInput,
    originalKey?: string,
  ) => Promise<boolean>;
  validateDraft: () => Promise<boolean>;
  retryMutation: () => Promise<boolean>;
};
