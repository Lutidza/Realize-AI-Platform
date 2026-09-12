/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerConfiguration.adapter.ts
 * @version 1.1.0
 * @date 2026-09-10
 * @description Подключает рабочую область к чтению черновиков, выпусков и versioned командам Config API.
 */
import type {
  AIConfigBootstrapDTO,
  AIConfigDraftDTO,
  AIConfigDraftSummaryDTO,
  AIConfigValidationDTO,
  AIConfigReleaseDTO,
  AIConfigReleaseSummaryDTO,
  CreateAIConfigReleaseInput,
  ActivateAIConfigReleaseInput,
  ActiveAIConfigPointer,
} from "@realize/ai-contracts";
import { requestRealizeAI } from "../realizeAIAPI";
import type { AgentLayerMutation } from "./AgentLayerConfiguration.types";

export class AgentLayerConfigurationAdapter {
  release(id: string, signal: AbortSignal): Promise<AIConfigReleaseDTO> {
    return requestRealizeAI(`/config/releases/${encodeURIComponent(id)}`, {
      signal,
      cache: "no-store",
    });
  }
  createRelease(
    input: CreateAIConfigReleaseInput,
    idempotencyKey: string,
    signal: AbortSignal,
  ): Promise<AIConfigReleaseSummaryDTO> {
    return requestRealizeAI("/config/releases", {
      method: "POST",
      signal,
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": idempotencyKey },
      cache: "no-store",
    });
  }
  activateRelease(
    input: ActivateAIConfigReleaseInput,
    idempotencyKey: string,
    signal: AbortSignal,
  ): Promise<ActiveAIConfigPointer> {
    return requestRealizeAI("/config/activate", {
      method: "POST",
      signal,
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": idempotencyKey },
      cache: "no-store",
    });
  }
  bootstrap(signal: AbortSignal): Promise<AIConfigBootstrapDTO> {
    return requestRealizeAI("/config", { signal, cache: "no-store" });
  }
  draft(id: string, signal: AbortSignal): Promise<AIConfigDraftDTO> {
    return requestRealizeAI(`/config/drafts/${encodeURIComponent(id)}`, {
      signal,
      cache: "no-store",
    });
  }
  async mutate(
    command: AgentLayerMutation,
    signal: AbortSignal,
  ): Promise<AIConfigDraftSummaryDTO | AIConfigValidationDTO> {
    const path =
      command.kind === "create"
        ? "/config/drafts"
        : command.kind === "update"
          ? `/config/drafts/${encodeURIComponent(command.draftID)}`
          : "/config/validate";
    return requestRealizeAI(path, {
      method: command.kind === "update" ? "PUT" : "POST",
      signal,
      body: JSON.stringify(command.input),
      headers: { "Idempotency-Key": command.idempotencyKey },
      cache: "no-store",
    });
  }
}
