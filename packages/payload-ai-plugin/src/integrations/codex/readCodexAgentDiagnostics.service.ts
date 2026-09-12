/**
 * @file packages/payload-ai-plugin/src/integrations/codex/readCodexAgentDiagnostics.service.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Собирает текущие настройки, состояние транспорта и доказуемые разрешения агента.
 * @see documentation/architecture/codex-integration.md
 */

import type {
  CodexAgentDiagnosticsDTO,
  CodexAgentOperationDiagnosticsDTO,
  CodexIntegrationConnectionDTO,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { IntegrationRepository } from "../../endpoints/integrationRepository";
import type { AIDocument } from "../../endpoints/repository";
import {
  githubConfigurationOf,
  toCodexIntegrationDTO,
} from "../../endpoints/integrationMappers";
import { resolveRuntimeStatus } from "../../runtime/resolveRuntimeStatus.service";
import type { SanitizedRealizeAIPluginOptions } from "../../types";
import { PRIMARY_CODEX_CONNECTION_KEY } from "../providers";
import type { GitHubIntegrationRow } from "../runtime/IntegrationRuntime.types";
import { validateRuntimeGitHubIntegration } from "../runtime/validateRuntimeGitHubIntegration.validator";
import { readWorkerPresence } from "../runtime/readWorkerPresence.service";
import { mapWorkerAvailability } from "../runtime/mapWorkerAvailability.mapper";
import { resolveCodexRuntimeOptions } from "./resolveCodexRuntimeOptions.service";

const blocked = (reason: string): CodexAgentOperationDiagnosticsDTO => ({
  state: "blocked",
  reason,
});

/** Совпадает с постоянными prerequisites публикации; accepted preview и approval проверяются при действии. */
const sourceConnectionReason = async (
  connectionRead: Promise<AIDocument | undefined>,
): Promise<string | undefined> => {
  try {
    const connection = await connectionRead;
    if (
      !connection ||
      connection.provider !== "github" ||
      connection.enabled !== true ||
      connection.lastTestStatus !== "passed" ||
      typeof connection.credentialEnvelope !== "string" ||
      !connection.credentialEnvelope
    )
      return "Подключите, включите и проверьте GitHub в разделе интеграций.";
    if (!githubConfigurationOf(connection.configuration).defaultBranch)
      return "Проверка GitHub должна определить основную ветку репозитория.";
    if (
      !Number.isInteger(Number(connection.revision)) ||
      Number(connection.revision) < 1
    )
      return "Настройки подключения GitHub недоступны. Проверьте интеграцию.";
  } catch {
    return "Настройки подключения GitHub недоступны. Проверьте интеграцию.";
  }
};

/** Orchestrator допускает отсутствие GitHub; сохранённое подключение обязано пройти тот же структурный gate, что worker. */
const releaseConnectionReason = async (
  connectionRead: Promise<AIDocument | undefined>,
): Promise<string | undefined> => {
  try {
    const connection = await connectionRead;
    // Непроверенные поля Payload переводятся в форму входа существующего runtime validator.
    const integration = validateRuntimeGitHubIntegration(
      connection
        ? ({
            configuration: connection.configuration,
            connection_key: connection.connectionKey,
            credential_envelope: connection.credentialEnvelope,
            enabled: connection.enabled,
            provider: connection.provider,
            revision: connection.revision,
          } as GitHubIntegrationRow)
        : undefined,
    );
    if (integration.state === "disabled")
      return "Сохранённое подключение GitHub выключено и блокирует подготовку выпуска.";
  } catch {
    return "Настройки или данные доступа сохранённого подключения GitHub недоступны. Проверьте интеграцию.";
  }
};

/** Не вызывает модель, не меняет test metadata и не считает окружение Next состоянием отдельного worker. */
export const readCodexAgentDiagnostics = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
): Promise<CodexAgentDiagnosticsDTO> => {
  const repository = new IntegrationRepository(req.payload, req);
  const presenceRead = readWorkerPresence(req);
  const connectionRead = repository.getByConnectionKey(
    PRIMARY_CODEX_CONNECTION_KEY,
  );
  let current = await resolveCodexRuntimeOptions(req, options, connectionRead);
  let connection: CodexIntegrationConnectionDTO | undefined;
  try {
    const document = await connectionRead;
    if (document) connection = toCodexIntegrationDTO(document);
  } catch {
    current = {
      ...current,
      enabled: false,
      runtimeStatus: {
        enabled: current.runtimeStatus?.enabled ?? false,
        mode: current.runtime.mode,
        state: "unavailable",
        reason: "Настройки подключения Codex недоступны. Проверьте интеграцию.",
      },
    };
  }
  let runtime = await resolveRuntimeStatus(current);
  let canUseChat = false;
  try {
    canUseChat = await options.access.canUseChat({ req });
  } catch {
    // Недоступное решение прав не разрешает операции и не раскрывает детали access resolver.
  }
  if (!canUseChat)
    runtime = {
      ...runtime,
      state: "unavailable",
      reason: "У вашей учётной записи нет разрешения на работу с агентом.",
    };
  const agent = connection?.configuration.agent;
  const operation = (enabled: boolean): CodexAgentOperationDiagnosticsDTO => {
    if (!connection)
      return blocked(
        current.runtimeStatus?.reason ??
          "Настройте подключение Codex в разделе интеграций.",
      );
    if (!enabled)
      return { state: "disabled", reason: "Выключено в настройках агента." };
    if (!current.enabled)
      return blocked(
        current.runtimeStatus?.reason ?? "Административный агент недоступен.",
      );
    if (!canUseChat)
      return blocked(
        "У вашей учётной записи нет разрешения на работу с агентом.",
      );
    if (!connection?.configuration.chat.tools.codeChanges)
      return blocked(
        "Изменения кода выключены в настройках инструментов чата.",
      );
    return {
      state: "allowed",
      reason: "Разрешено настройками и правами.",
    };
  };
  const operations: CodexAgentDiagnosticsDTO["operations"] = {
    execution: operation(agent?.execution.enabled ?? false),
    preview: operation(agent?.preview.enabled ?? false),
    sourcePromotion: operation(agent?.sourcePromotion.enabled ?? false),
    release: operation(agent?.release.enabled ?? false),
  };
  if (operations.execution.state === "allowed") {
    const secret = process.env[current.execution.signingSecretEnv] ?? "";
    if (Buffer.byteLength(secret, "utf8") < 32)
      operations.execution = blocked(
        "Серверная подпись заданий не настроена. Требуется настройка инфраструктуры.",
      );
  }
  if (operations.preview.state === "allowed" && !agent?.execution.enabled)
    operations.preview = blocked(
      "Сначала разрешите выполнение кода в настройках агента.",
    );
  if (
    operations.sourcePromotion.state === "allowed" ||
    operations.release.state === "allowed"
  ) {
    const githubRead = repository.getPrimaryGitHub();
    if (operations.sourcePromotion.state === "allowed") {
      const reason = await sourceConnectionReason(githubRead);
      if (reason) operations.sourcePromotion = blocked(reason);
    }
    if (operations.release.state === "allowed") {
      const reason = await releaseConnectionReason(githubRead);
      if (reason) operations.release = blocked(reason);
    }
  }
  const presence = await presenceRead;
  const worker = mapWorkerAvailability(presence);
  for (const kind of [
    "execution",
    "preview",
    "sourcePromotion",
    "release",
  ] as const) {
    if (operations[kind].state !== "allowed") continue;
    const availability = mapWorkerAvailability(presence, { operation: kind });
    operations[kind] =
      availability.state === "unavailable"
        ? blocked(availability.reason)
        : { state: "allowed", reason: availability.reason };
  }
  const accessTest: CodexAgentDiagnosticsDTO["accessTest"] = {
    status: connection?.lastTestStatus ?? "never",
  };
  if (
    accessTest.status !== "never" &&
    connection?.lastTestedAt &&
    Number.isFinite(Date.parse(connection.lastTestedAt))
  )
    accessTest.checkedAt = connection.lastTestedAt;
  return {
    checkedAt: new Date().toISOString(),
    runtime,
    connection: connection
      ? {
          connectionKey: connection.connectionKey,
          displayName: connection.displayName,
          revision: connection.revision,
          authMode: connection.configuration.authMode,
        }
      : null,
    models: {
      model: agent?.model ?? "",
      reviewModel: agent?.reviewModel ?? "",
    },
    accessTest,
    operations,
    worker,
  };
};
