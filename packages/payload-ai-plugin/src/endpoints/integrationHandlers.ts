/**
 * @file packages/payload-ai-plugin/src/endpoints/integrationHandlers.ts
 * @version 1.2.0
 * @date 2026-09-09
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Обрабатывает разрешённые чтение, сохранение, REST-проверку и отключение GitHub.
 */

import {
  parseDisconnectIntegrationInput,
  parseGitHubRepositoryURL,
  parseGitIntegrationTransport,
  parseSaveGitHubIntegrationInput,
  parseTestGitHubIntegrationInput,
} from "@realize/ai-contracts";
import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import {
  encryptIntegrationCredential,
  isIntegrationVaultConfigured,
} from "../integrations/credentialVault";
import { PRIMARY_GITHUB_CONNECTION_KEY } from "../integrations/providers";
import { loadIntegrationCatalog } from "../integrations/loadIntegrationCatalog.service";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { consumeRateLimit, requireIntegrationManager } from "./access";
import { testGitHubConnection } from "../integrations/githubProvider";
import { EndpointError, success } from "./http";
import {
  decryptGitHubCredential,
  integrationVaultError,
  replayedGitHubTest,
  requireMatchingIntegrationReplay,
  runIntegrationTransaction,
} from "./integrationHandlerSupport";
import {
  githubConfigurationOf,
  toGitHubIntegrationDTO,
} from "./integrationMappers";
import { IntegrationRepository } from "./integrationRepository";
import { idempotencyKeyFor, readBody, withHandler } from "./request";

/** Создаёт API управления интеграциями в Admin независимо от провайдера. */
export const createIntegrationHandlers = (
  options: SanitizedRealizeAIPluginOptions,
): {
  disconnectGitHub: PayloadEndpointHandler;
  list: PayloadEndpointHandler;
  saveGitHub: PayloadEndpointHandler;
  testGitHub: PayloadEndpointHandler;
} => ({
  list: withHandler(async (req, correlationID) => {
    await requireIntegrationManager(req, options);
    const repository = new IntegrationRepository(req.payload, req);
    const data = await loadIntegrationCatalog(
      repository,
      options.integrations.encryptionKeyEnv,
    );
    return success(data, correlationID);
  }),

  saveGitHub: withHandler(async (req, correlationID) => {
    const user = await requireIntegrationManager(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseSaveGitHubIntegrationInput(await readBody(req));
    const repository = new IntegrationRepository(req.payload, req);
    const saved = await runIntegrationTransaction(req, async () => {
      const replay = await repository.findEvent(idempotencyKey);
      if (replay) {
        requireMatchingIntegrationReplay(replay, "saved", user.id);
        const current = await repository.getPrimaryGitHub();
        if (!current) {
          throw new EndpointError(
            "CONFLICT",
            "The replayed integration no longer exists.",
            409,
          );
        }
        return current;
      }
      const existing = await repository.getPrimaryGitHub();
      const currentRevision = existing ? Number(existing.revision) : 0;
      if (currentRevision !== input.expectedRevision) {
        throw new EndpointError(
          "CONFLICT",
          "Integration settings changed. Reload before saving.",
          409,
        );
      }
      const normalized = parseGitHubRepositoryURL(input.repositoryURL);
      const previousConfiguration = existing
        ? githubConfigurationOf(existing.configuration)
        : undefined;
      const transport = parseGitIntegrationTransport(
        input.transport === undefined ? previousConfiguration || {} : input,
      );
      const commitAuthor =
        input.commitAuthor === undefined
          ? previousConfiguration?.commitAuthor
          : (input.commitAuthor ?? undefined);
      if (
        (transport.transport === "https" || input.token) &&
        !isIntegrationVaultConfigured(options.integrations.encryptionKeyEnv)
      ) {
        throw integrationVaultError();
      }
      const repositoryChanged =
        previousConfiguration?.repositorySlug !== normalized.repositorySlug;
      let credentialEnvelope =
        typeof existing?.credentialEnvelope === "string"
          ? existing.credentialEnvelope
          : undefined;
      let credentialUpdatedAt =
        typeof existing?.credentialUpdatedAt === "string"
          ? existing.credentialUpdatedAt
          : undefined;
      if (input.token) {
        credentialEnvelope = encryptIntegrationCredential({
          binding: {
            connectionKey: PRIMARY_GITHUB_CONNECTION_KEY,
            provider: "github",
          },
          encryptionKey: process.env[options.integrations.encryptionKeyEnv],
          plaintext: input.token,
        });
        credentialUpdatedAt = new Date().toISOString();
      }
      if (transport.transport === "https" && !credentialEnvelope) {
        throw new EndpointError(
          "INVALID_REQUEST",
          "A GitHub token is required for an HTTPS connection.",
          400,
        );
      }
      const transportChanged =
        previousConfiguration?.transport !== transport.transport ||
        previousConfiguration?.sshProfileRef !== transport.sshProfileRef;
      const resetTest =
        repositoryChanged || transportChanged || Boolean(input.token);
      const document = await repository.saveGitHub({
        actorID: user.id,
        configuration: {
          ...transport,
          ...(commitAuthor ? { commitAuthor } : {}),
          ...(repositoryChanged || !previousConfiguration?.defaultBranch
            ? {}
            : { defaultBranch: previousConfiguration.defaultBranch }),
          repositorySlug: normalized.repositorySlug,
          repositoryURL: normalized.repositoryURL,
        },
        credentialEnvelope,
        credentialUpdatedAt,
        displayName: input.displayName || "Основной GitHub",
        enabled: input.enabled,
        existing,
        lastTestStatus: resetTest
          ? "never"
          : (existing?.lastTestStatus as "failed" | "never" | "passed"),
        revision: currentRevision + 1,
      });
      await repository.recordEvent({
        action: "saved",
        actorID: user.id,
        idempotencyKey,
        metadata: {
          enabled: input.enabled,
          repositorySlug: normalized.repositorySlug,
          revision: currentRevision + 1,
          ...transport,
          tokenRotated: Boolean(input.token),
        },
        status: "passed",
        summary: "GitHub integration settings saved.",
      });
      return document;
    });
    return success(toGitHubIntegrationDTO(saved), correlationID, 200);
  }),

  testGitHub: withHandler(async (req, correlationID) => {
    const user = await requireIntegrationManager(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseTestGitHubIntegrationInput(await readBody(req));
    const repository = new IntegrationRepository(req.payload, req);
    const replay = await repository.findEvent(idempotencyKey);
    if (replay) {
      requireMatchingIntegrationReplay(replay, "tested", user.id);
      return success(replayedGitHubTest(replay), correlationID);
    }
    const existing = await repository.getPrimaryGitHub();
    const storedConfiguration = existing
      ? githubConfigurationOf(existing.configuration)
      : undefined;
    const normalized = input.repositoryURL
      ? parseGitHubRepositoryURL(input.repositoryURL)
      : storedConfiguration;
    if (!normalized) {
      throw new EndpointError(
        "INVALID_REQUEST",
        "A GitHub repository URL is required.",
        400,
      );
    }
    const token =
      input.token ||
      decryptGitHubCredential(existing?.credentialEnvelope, options);
    const providerResult = await testGitHubConnection({
      repositorySlug: normalized.repositorySlug,
      token,
    });
    // REST permissions не свидетельствуют о наличии SSH-профиля у Git-исполнителя.
    const result = {
      ...providerResult,
      message: `${providerResult.message} Проверка GitHub API не проверяет SSH-профиль.`,
    };
    await runIntegrationTransaction(req, async () => {
      const latestReplay = await repository.findEvent(idempotencyKey);
      if (latestReplay) {
        requireMatchingIntegrationReplay(latestReplay, "tested", user.id);
        return;
      }
      const testsPersistedConnection =
        Boolean(existing) &&
        !input.token &&
        normalized.repositorySlug === storedConfiguration?.repositorySlug;
      if (existing && testsPersistedConnection) {
        await repository.recordGitHubTest({
          connection: existing,
          defaultBranch: result.defaultBranch,
          errorCode:
            result.status === "failed" ? "GITHUB_ACCESS_FAILED" : undefined,
          status: result.status,
          testedAt: result.checkedAt,
        });
      }
      await repository.recordEvent({
        action: "tested",
        actorID: user.id,
        idempotencyKey,
        metadata: result,
        status: result.status,
        summary:
          result.status === "passed"
            ? "GitHub repository access confirmed."
            : "GitHub repository access check failed.",
      });
    });
    return success(result, correlationID);
  }),

  disconnectGitHub: withHandler(async (req, correlationID) => {
    const user = await requireIntegrationManager(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseDisconnectIntegrationInput(await readBody(req));
    const repository = new IntegrationRepository(req.payload, req);
    await runIntegrationTransaction(req, async () => {
      const replay = await repository.findEvent(idempotencyKey);
      if (replay) {
        requireMatchingIntegrationReplay(replay, "disconnected", user.id);
        return;
      }
      const existing = await repository.getPrimaryGitHub();
      if (!existing) {
        throw new EndpointError(
          "NOT_FOUND",
          "GitHub integration is not configured.",
          404,
        );
      }
      if (Number(existing.revision) !== input.expectedRevision) {
        throw new EndpointError(
          "CONFLICT",
          "Integration settings changed. Reload before disconnecting.",
          409,
        );
      }
      await repository.disconnect(existing, input.expectedRevision);
      await repository.recordEvent({
        action: "disconnected",
        actorID: user.id,
        idempotencyKey,
        metadata: { revision: input.expectedRevision },
        status: "passed",
        summary: "GitHub integration disconnected.",
      });
    });
    return success(
      { disconnected: true as const, provider: "github" as const },
      correlationID,
    );
  }),
});
