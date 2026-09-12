/**
 * @file packages/payload-ai-plugin/src/integrations/codex/resolveCodexRuntimeOptions.service.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Проецирует текущую интеграцию в параметры одного HTTP-запроса без общего изменяемого состояния.
 * @see documentation/architecture/codex-integration.md
 */

import {
  CODEX_AGENT_SETTINGS_DEFAULTS,
  parseCodexIntegrationConfiguration,
  type CodexAgentSettingsDTO,
  type RuntimeStatusDTO,
} from "@realize/ai-contracts";
import { validateCodexCredential } from "@realize/codex-adapter/profile";
import type { PayloadRequest } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../../types";
import { IntegrationRepository } from "../../endpoints/integrationRepository";
import type { AIDocument } from "../../endpoints/repository";
import { decryptIntegrationCredential } from "../credentialVault";
import { PRIMARY_CODEX_CONNECTION_KEY } from "../providers";
import { readCodexAuthEnvironment } from "./readCodexAuthEnvironment.service";

/** Проверяет авторизацию локально; переданное чтение позволяет диагностике использовать ту же версию подключения. */
export const resolveCodexRuntimeOptions = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  connectionRead?: Promise<AIDocument | undefined>,
): Promise<SanitizedRealizeAIPluginOptions> => {
  let settings: CodexAgentSettingsDTO = CODEX_AGENT_SETTINGS_DEFAULTS;
  let status: RuntimeStatusDTO = {
    enabled: false,
    mode: options.runtime.mode,
    state: "unavailable",
    reason:
      "Подключите Codex в разделе интеграций, чтобы запустить административного агента.",
  };
  try {
    const connection = await (connectionRead ??
      new IntegrationRepository(req.payload, req).getByConnectionKey(
        PRIMARY_CODEX_CONNECTION_KEY,
      ));
    if (connection) {
      status.enabled = connection.enabled === true;
      if (
        connection.provider !== "codex" ||
        typeof connection.enabled !== "boolean"
      )
        throw new Error("invalid_connection");
      const configuration = parseCodexIntegrationConfiguration(
        connection.configuration,
      );
      settings = configuration.agent;
      if (!connection.enabled) {
        status = {
          ...status,
          state: "disabled",
          reason:
            "Административный агент выключен в настройках интеграции Codex.",
        };
      } else if (configuration.authMode === "workloadIdentity") {
        if (
          connection.credentialEnvelope != null ||
          !(await readCodexAuthEnvironment()).workloadIdentity.configured
        )
          throw new Error("unconfigured_identity");
        status = { enabled: true, mode: options.runtime.mode, state: "ready" };
      } else {
        if (
          typeof connection.credentialEnvelope !== "string" ||
          !connection.credentialEnvelope
        )
          throw new Error("missing_credential");
        validateCodexCredential(
          decryptIntegrationCredential({
            binding: {
              provider: "codex",
              connectionKey: PRIMARY_CODEX_CONNECTION_KEY,
            },
            encryptionKey: process.env[options.integrations.encryptionKeyEnv],
            envelope: connection.credentialEnvelope,
          }),
          configuration.authMode,
        );
        status = { enabled: true, mode: options.runtime.mode, state: "ready" };
      }
    }
  } catch {
    status = {
      ...status,
      state: "unavailable",
      reason:
        "Настройки или авторизация Codex недоступны. Проверьте подключение в разделе интеграций.",
    };
  }
  if (options.runtime.isolated)
    status = {
      enabled: false,
      mode: options.runtime.mode,
      state: "disabled",
      reason:
        "Запуск агента недоступен в изолированном окружении проверки или preview.",
    };
  const enabled = status.state === "ready";
  return {
    ...options,
    enabled,
    runtimeStatus: status,
    runtime: { ...options.runtime, model: settings.model || undefined },
    execution: {
      ...options.execution,
      ...settings.execution,
      enabled: enabled && settings.execution.enabled,
    },
    preview: {
      ...settings.preview,
      enabled: enabled && settings.preview.enabled,
    },
    release: {
      ...settings.release,
      enabled: enabled && settings.release.enabled,
    },
    sourcePromotion: { enabled: enabled && settings.sourcePromotion.enabled },
  };
};
