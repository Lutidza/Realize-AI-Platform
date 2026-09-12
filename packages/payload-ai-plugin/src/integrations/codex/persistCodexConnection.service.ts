/**
 * @file packages/payload-ai-plugin/src/integrations/codex/persistCodexConnection.service.ts
 * @version 1.3.0
 * @date 2026-09-11
 * @description Сохраняет подключение Codex через общий vault, optimistic revision и audit.
 */

import {
  parseCodexIntegrationConfiguration,
  type CodexIntegrationConnectionDTO,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { validateCodexCredential } from "@realize/codex-adapter/profile";
import { hashCanonicalJSON } from "@realize/change-engine";
import { EndpointError } from "../../endpoints/http";
import {
  integrationVaultError,
  requireMatchingIntegrationReplay,
  runIntegrationTransaction,
} from "../../endpoints/integrationHandlerSupport";
import { toCodexIntegrationDTO } from "../../endpoints/integrationMappers";
import { IntegrationRepository } from "../../endpoints/integrationRepository";
import type { SanitizedRealizeAIPluginOptions } from "../../types";
import {
  encryptIntegrationCredential,
  isIntegrationVaultConfigured,
} from "../credentialVault";
import { PRIMARY_CODEX_CONNECTION_KEY } from "../providers";
import type { PersistCodexConnectionInput } from "./CodexConnectionMutation.types";
import { withCodexMutationLock } from "./withCodexMutationLock.service";
import { readCodexAuthEnvironment } from "./readCodexAuthEnvironment.service";

/** Общая операция для официальных способов авторизации и managed ChatGPT login. */
export const persistCodexConnection = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  operation: PersistCodexConnectionInput,
): Promise<CodexIntegrationConnectionDTO> => {
  const repository = new IntegrationRepository(req.payload, req);
  const workloadIdentity = operation.input.authMode === "workloadIdentity";
  const requestHash = hashCanonicalJSON({
    authMode: operation.input.authMode,
    apiKey: operation.input.apiKey ?? null,
    accessToken: operation.input.accessToken ?? null,
    loginMethod: operation.input.loginMethod ?? null,
    displayName: operation.input.displayName ?? null,
    enabled: operation.input.enabled,
    expectedRevision: operation.input.expectedRevision,
  });
  const readCurrent = async () => {
    const replay = await repository.findEvent(operation.idempotencyKey);
    if (replay) {
      requireMatchingIntegrationReplay(
        replay,
        "saved",
        operation.actorID,
        "codex",
        requestHash,
      );
      const current = await repository.getByConnectionKey(
        PRIMARY_CODEX_CONNECTION_KEY,
      );
      if (!current)
        throw new EndpointError(
          "CONFLICT",
          "Сохранённое ранее подключение Codex больше не существует.",
          409,
        );
      return {
        existing: current,
        previous: toCodexIntegrationDTO(current),
        replayed: true,
      };
    }
    const existing = await repository.getByConnectionKey(
      PRIMARY_CODEX_CONNECTION_KEY,
    );
    const previous = existing ? toCodexIntegrationDTO(existing) : undefined;
    if ((previous?.revision ?? 0) !== operation.input.expectedRevision) {
      throw new EndpointError(
        "CONFLICT",
        "Настройки Codex изменились. Обновите страницу перед сохранением.",
        409,
      );
    }
    const sameMode =
      previous?.configuration.authMode === operation.input.authMode;
    if (
      !workloadIdentity &&
      !operation.credential &&
      (!sameMode || !previous?.hasCredential)
    ) {
      throw new EndpointError(
        "INVALID_REQUEST",
        operation.input.authMode === "chatgpt"
          ? "Войдите в ChatGPT, чтобы подключить аккаунт."
          : operation.input.authMode === "accessToken"
            ? "Для этого подключения требуется Codex access token."
            : "Для этого подключения требуется API key.",
        400,
      );
    }
    return { existing, previous, replayed: false };
  };
  const preflight = await readCurrent();
  if (preflight.replayed) return preflight.previous!;
  if (
    workloadIdentity &&
    !(await readCodexAuthEnvironment()).workloadIdentity.configured
  )
    throw new EndpointError(
      "INTEGRATION_UNAVAILABLE",
      "Сначала настройте workload identity на сервере.",
      503,
    );
  if (
    !workloadIdentity &&
    !isIntegrationVaultConfigured(options.integrations.encryptionKeyEnv)
  )
    throw integrationVaultError();
  // Внешний auth process не держит DB transaction; перед записью revision проверяется заново.
  const material = operation.credential
    ? await operation.credential()
    : undefined;
  const authJSON = material
    ? validateCodexCredential(material.authJSON, operation.input.authMode)
    : undefined;
  return withCodexMutationLock(req, () =>
    runIntegrationTransaction(req, async () => {
      const { existing, previous, replayed } = await readCurrent();
      if (replayed) return previous!;
      const account = material ?? previous?.configuration;
      const configuration = parseCodexIntegrationConfiguration({
        authMode: operation.input.authMode,
        chat: previous?.configuration.chat,
        agent: previous?.configuration.agent,
        ...(operation.input.authMode === "chatgpt"
          ? {
              loginMethod:
                operation.input.loginMethod ??
                previous?.configuration.loginMethod ??
                "deviceCode",
            }
          : {}),
        ...(operation.input.authMode === "chatgpt" ||
        operation.input.authMode === "accessToken"
          ? {
              ...(account?.accountEmail
                ? { accountEmail: account.accountEmail }
                : {}),
              ...(account?.planType ? { planType: account.planType } : {}),
            }
          : {}),
      });
      const credentialEnvelope = workloadIdentity
        ? null
        : material
          ? encryptIntegrationCredential({
              binding: {
                connectionKey: PRIMARY_CODEX_CONNECTION_KEY,
                provider: "codex",
              },
              encryptionKey: process.env[options.integrations.encryptionKeyEnv],
              plaintext: authJSON!,
            })
          : (existing?.credentialEnvelope as string);
      const saved = await repository.save({
        actorID: operation.actorID,
        category: "ai",
        configuration,
        connectionKey: PRIMARY_CODEX_CONNECTION_KEY,
        credentialEnvelope,
        credentialUpdatedAt: workloadIdentity
          ? null
          : material
            ? new Date().toISOString()
            : previous?.credentialUpdatedAt,
        displayName:
          operation.input.displayName ??
          previous?.displayName ??
          "Основной Codex",
        enabled: operation.input.enabled,
        existing,
        lastTestStatus:
          material ||
          previous?.configuration.authMode !== operation.input.authMode
            ? "never"
            : (previous?.lastTestStatus ?? "never"),
        provider: "codex",
        revision: operation.input.expectedRevision + 1,
      });
      await repository.recordEvent({
        action: "saved",
        actorID: operation.actorID,
        connectionKey: PRIMARY_CODEX_CONNECTION_KEY,
        idempotencyKey: operation.idempotencyKey,
        metadata: {
          authMode: configuration.authMode,
          enabled: operation.input.enabled,
          revision: operation.input.expectedRevision + 1,
          credentialRotated: Boolean(material),
          ...(configuration.loginMethod
            ? { loginMethod: configuration.loginMethod }
            : {}),
          requestHash,
        },
        provider: "codex",
        status: "passed",
        summary: "Настройки подключения Codex сохранены.",
      });
      return toCodexIntegrationDTO(saved);
    }),
  );
};
