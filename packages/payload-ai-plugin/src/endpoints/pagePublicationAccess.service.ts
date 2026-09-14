/**
 * @file packages/payload-ai-plugin/src/endpoints/pagePublicationAccess.service.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Проверяет отдельное право публикации до транзакции и внешних эффектов.
 */
import type { PayloadRequest } from "payload";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../constants";
import type { RealizeAIServerRuntime } from "../types";
import { EndpointError } from "./http";
import type { PagePublicationAdapter } from "./PagePublication.types";

export const requirePagePublicationAccess = async (
  req: PayloadRequest,
): Promise<PagePublicationAdapter> => {
  if (!req.user)
    throw new EndpointError(
      "UNAUTHENTICATED",
      "Для публикации войдите в админку.",
      401,
    );
  const runtime = req.payload.config.custom?.[REALIZE_AI_SERVER_RUNTIME_KEY] as
    RealizeAIServerRuntime | undefined;
  const adapter = runtime?.pageDraft?.publication;
  if (
    !adapter ||
    adapter.version !== "1.0" ||
    typeof adapter.check !== "function" ||
    typeof adapter.revalidate !== "function" ||
    typeof adapter.canPublish !== "function"
  )
    throw new EndpointError(
      "CONFLICT",
      "Публикация страниц не подключена к этому проекту.",
      409,
    );
  if (
    !(await runtime?.canUseChat?.({ req })) ||
    !(await runtime?.canManageData?.({ req })) ||
    !(await adapter.canPublish(req))
  )
    throw new EndpointError(
      "FORBIDDEN",
      "Недостаточно прав для публикации страниц.",
      403,
    );
  return adapter;
};

export const isPagePublicationKind = (
  kind: unknown,
): kind is "pages.publishDraft.v1" | "pages.restorePublication.v1" =>
  kind === "pages.publishDraft.v1" || kind === "pages.restorePublication.v1";
