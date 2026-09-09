/**
 * @file packages/payload-ai-plugin/src/integrations/codex/testCodexIntegration.service.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Проверяет сохранённое подключение Codex под общей runtime lease и сохраняет audit.
 */

import {
  parseCodexIntegrationConfiguration,
  type TestCodexIntegrationDTO,
} from "@realize/ai-contracts";
import { readCodexProfileAuth } from "@realize/codex-adapter/profile";
import type { PayloadRequest } from "payload";
import { hashCanonicalJSON } from "@realize/change-engine";
import { EndpointError } from "../../endpoints/http";
import {
  requireMatchingIntegrationReplay,
  runIntegrationTransaction,
} from "../../endpoints/integrationHandlerSupport";
import { toCodexIntegrationDTO } from "../../endpoints/integrationMappers";
import { IntegrationRepository } from "../../endpoints/integrationRepository";
import type { SanitizedRealizeAIPluginOptions } from "../../types";
import { PRIMARY_CODEX_CONNECTION_KEY } from "../providers";
import type { TestCodexMutationInput } from "./CodexConnectionMutation.types";
import { CodexConnectionService } from "./runtime/CodexConnection.service";
import { testCodexCredential } from "./testCodexCredential.service";
import { codexPayloadPool } from "./codexPayloadDatabase.adapter";

/** Восстанавливает только явные безопасные поля результата проверки из audit. */
const resultOf = (value: unknown): TestCodexIntegrationDTO => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Сохранённый результат проверки Codex некорректен.");
  const source = value as Record<string, unknown>;
  if (
    (source.status !== "failed" && source.status !== "passed") ||
    typeof source.checkedAt !== "string" ||
    typeof source.message !== "string"
  )
    throw new Error("Сохранённый результат проверки Codex некорректен.");
  const account = parseCodexIntegrationConfiguration({
    authMode: "chatgpt",
    ...(source.accountEmail ? { accountEmail: source.accountEmail } : {}),
    ...(source.planType ? { planType: source.planType } : {}),
  });
  return {
    checkedAt: source.checkedAt,
    message: source.message,
    status: source.status,
    ...(account.accountEmail ? { accountEmail: account.accountEmail } : {}),
    ...(account.planType ? { planType: account.planType } : {}),
  };
};

/** Lease сериализует refresh с runtime; test metadata не меняет revision или envelope. */
export const testCodexIntegration = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  operation: TestCodexMutationInput,
): Promise<TestCodexIntegrationDTO> => {
  const repository = new IntegrationRepository(req.payload, req);
  const requestHash = hashCanonicalJSON(operation.input);
  const replay = await repository.findEvent(operation.idempotencyKey);
  if (replay) {
    requireMatchingIntegrationReplay(
      replay,
      "tested",
      operation.actorID,
      "codex",
      requestHash,
    );
    return resultOf(replay.metadata);
  }
  const pool = codexPayloadPool(req);
  const service = new CodexConnectionService({
    pool,
    encryptionKey: process.env[options.integrations.encryptionKeyEnv],
  });
  const lease = await service.acquire({ allowDisabled: true });
  try {
    if (lease.revision !== operation.input.expectedRevision)
      throw new EndpointError(
        "CONFLICT",
        "Настройки Codex изменились. Обновите страницу перед проверкой.",
        409,
      );
    const existing = await repository.getByConnectionKey(
      PRIMARY_CODEX_CONNECTION_KEY,
    );
    if (
      !existing ||
      toCodexIntegrationDTO(existing).revision !== lease.revision
    )
      throw new EndpointError(
        "CONFLICT",
        "Настройки Codex изменились. Обновите страницу перед проверкой.",
        409,
      );
    const result = resultOf(
      await testCodexCredential({
        authJSON:
          lease.authMode === "workloadIdentity" ||
          lease.authMode === "accessToken"
            ? undefined
            : await readCodexProfileAuth(lease.home),
        authMode: lease.authMode,
        profile: lease,
      }),
    );
    await runIntegrationTransaction(req, async () => {
      const latestReplay = await repository.findEvent(operation.idempotencyKey);
      if (latestReplay) {
        requireMatchingIntegrationReplay(
          latestReplay,
          "tested",
          operation.actorID,
          "codex",
          requestHash,
        );
        return;
      }
      await repository.recordTest({
        connection: existing,
        status: result.status,
        testedAt: result.checkedAt,
        errorCode:
          result.status === "failed" ? "CODEX_ACCESS_FAILED" : undefined,
      });
      await repository.recordEvent({
        action: "tested",
        actorID: operation.actorID,
        connectionKey: PRIMARY_CODEX_CONNECTION_KEY,
        provider: "codex",
        idempotencyKey: operation.idempotencyKey,
        metadata: { ...result, requestHash },
        status: result.status,
        summary:
          result.status === "passed"
            ? "Доступ к аккаунту Codex подтверждён."
            : "Проверка доступа к аккаунту Codex не пройдена.",
      });
    });
    return result;
  } finally {
    await lease.dispose();
  }
};
