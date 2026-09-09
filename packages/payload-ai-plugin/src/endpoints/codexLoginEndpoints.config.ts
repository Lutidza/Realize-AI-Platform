/**
 * @file packages/payload-ai-plugin/src/endpoints/codexLoginEndpoints.config.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Регистрирует защищённые маршруты начала, проверки и отмены входа Codex.
 */

import { createHash } from "node:crypto";
import {
  parseCodexLoginSessionInput,
  parseCompleteCodexBrowserLoginInput,
  parseStartCodexLoginInput,
} from "@realize/ai-contracts";
import type { Endpoint, PayloadRequest } from "payload";
import { DEFAULT_API_ROUTE } from "../constants";
import { getCodexLoginSessions } from "../integrations/codex/getCodexLoginSessions.service";
import { saveCompletedCodexLogin } from "../integrations/codex/saveCompletedCodexLogin.service";
import { startCodexLogin } from "../integrations/codex/startCodexLogin.service";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { consumeRateLimit, requireIntegrationManager } from "./access";
import { success } from "./http";
import { idempotencyKeyFor, readBody, withHandler } from "./request";

export const createCodexLoginEndpoints = (
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] => {
  const authorize = async (req: PayloadRequest) => {
    const user = await requireIntegrationManager(req, options);
    const idempotencyKey = idempotencyKeyFor(req);
    return {
      user,
      idempotencyKey,
      owner: {
        actorKey: `${user.collection}:${user.id}`,
        installationKey: createHash("sha256")
          .update(req.payload.config.secret)
          .digest("hex"),
      },
    };
  };
  return [
    {
      path: `${DEFAULT_API_ROUTE}/integrations/codex/login/start`,
      method: "post",
      handler: withHandler(async (req, correlationID) => {
        const { owner, user, idempotencyKey } = await authorize(req);
        consumeRateLimit(user.id);
        const input = parseStartCodexLoginInput(await readBody(req));
        return success(
          await startCodexLogin(req, options, owner, input, idempotencyKey),
          correlationID,
        );
      }),
    },
    {
      path: `${DEFAULT_API_ROUTE}/integrations/codex/login/status`,
      method: "post",
      handler: withHandler(async (req, correlationID) => {
        const { owner, user } = await authorize(req);
        const { sessionID } = parseCodexLoginSessionInput(await readBody(req));
        const result = await getCodexLoginSessions().status(
          owner,
          sessionID,
          async (completed) =>
            await saveCompletedCodexLogin(req, options, {
              ...completed,
              actorID: user.id,
            }),
        );
        return success(result, correlationID);
      }),
    },
    {
      path: `${DEFAULT_API_ROUTE}/integrations/codex/login/complete`,
      method: "post",
      handler: withHandler(async (req, correlationID) => {
        const { owner, user } = await authorize(req);
        consumeRateLimit(user.id);
        const { sessionID, callbackURL } = parseCompleteCodexBrowserLoginInput(
          await readBody(req),
        );
        const result = await getCodexLoginSessions().completeBrowser(
          owner,
          sessionID,
          callbackURL,
          async (completed) =>
            await saveCompletedCodexLogin(req, options, {
              ...completed,
              actorID: user.id,
            }),
        );
        return success(result, correlationID);
      }),
    },
    {
      path: `${DEFAULT_API_ROUTE}/integrations/codex/login/cancel`,
      method: "post",
      handler: withHandler(async (req, correlationID) => {
        const { owner, user } = await authorize(req);
        consumeRateLimit(user.id);
        const { sessionID } = parseCodexLoginSessionInput(await readBody(req));
        await getCodexLoginSessions().cancel(owner, sessionID);
        return success({ status: "cancelled" }, correlationID);
      }),
    },
  ];
};
