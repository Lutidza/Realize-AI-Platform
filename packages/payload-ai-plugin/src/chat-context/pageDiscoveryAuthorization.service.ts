/**
 * @file packages/payload-ai-plugin/src/chat-context/pageDiscoveryAuthorization.service.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Восстанавливает текущего actor и проверяет интеграцию перед каждым вызовом страницы.
 */
import { createLocalReq, type PayloadRequest } from "payload";
import { requireChatUser, requireDataManager } from "../endpoints/access";
import { EndpointError } from "../endpoints/http";
import { resolveCodexRuntimeOptions } from "../integrations/codex/resolveCodexRuntimeOptions.service";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { readPageDiscoveryActor } from "./PageDiscovery.repository";
import { verifyPageDiscoveryGrant } from "./pageDiscoveryGrant.service";

/** Callback не использует cookie или user исходного HTTP-запроса как полномочия. */
export const authorizePageDiscovery = async (
  request: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  runID: string,
  token: string,
) => {
  const claims = verifyPageDiscoveryGrant(token, runID, options);
  const user = await readPageDiscoveryActor(
    request.payload,
    runID,
    claims.userID,
    options.userCollection,
  );
  const req = await createLocalReq({ user }, request.payload);
  const current = await resolveCodexRuntimeOptions(req, options);
  await requireChatUser(req, current);
  await requireDataManager(req, current);
  if (!current.enabled || !current.pageDraft?.text)
    throw new EndpointError(
      "FORBIDDEN",
      "Инструменты страниц сейчас недоступны.",
      403,
    );
  return { req, options: current, userID: claims.userID };
};
