/**
 * @file packages/payload-ai-plugin/src/endpoints/codexIntegrationHandlers.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Авторизует запросы настроек Codex и передаёт операции прикладным сервисам.
 */

import {
  parseDisconnectIntegrationInput,
  parseSaveCodexIntegrationInput,
  parseTestCodexIntegrationInput,
} from "@realize/ai-contracts";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { disconnectCodexIntegration } from "../integrations/codex/disconnectCodexIntegration.service";
import { saveCodexIntegration } from "../integrations/codex/saveCodexIntegration.service";
import { testCodexIntegration } from "../integrations/codex/testCodexIntegration.service";
import { readCodexAuthEnvironment } from "../integrations/codex/readCodexAuthEnvironment.service";
import { CodexConnectionError } from "../integrations/codex/runtime/CodexConnection.error";
import { consumeRateLimit, requireIntegrationManager } from "./access";
import { EndpointError, success } from "./http";
import { idempotencyKeyFor, readBody, withHandler } from "./request";

/** Access, parsing и DTO envelopes остаются на HTTP boundary. */
export const createCodexIntegrationHandlers = (
  options: SanitizedRealizeAIPluginOptions,
) => ({
  environment: withHandler(async (req, correlationID) => {
    await requireIntegrationManager(req, options);
    return success(await readCodexAuthEnvironment(), correlationID);
  }),
  save: withHandler(async (req, correlationID) => {
    const user = await requireIntegrationManager(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseSaveCodexIntegrationInput(await readBody(req));
    return success(
      await saveCodexIntegration(req, options, {
        actorID: user.id,
        idempotencyKey,
        input,
      }),
      correlationID,
    );
  }),
  test: withHandler(async (req, correlationID) => {
    const user = await requireIntegrationManager(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseTestCodexIntegrationInput(await readBody(req));
    try {
      return success(
        await testCodexIntegration(req, options, {
          actorID: user.id,
          idempotencyKey,
          input,
        }),
        correlationID,
      );
    } catch (error) {
      if (error instanceof CodexConnectionError)
        throw new EndpointError("INTEGRATION_UNAVAILABLE", error.message, 503);
      throw error;
    }
  }),
  disconnect: withHandler(async (req, correlationID) => {
    const user = await requireIntegrationManager(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseDisconnectIntegrationInput(await readBody(req));
    return success(
      await disconnectCodexIntegration(req, {
        actorID: user.id,
        idempotencyKey,
        input,
      }),
      correlationID,
    );
  }),
});
