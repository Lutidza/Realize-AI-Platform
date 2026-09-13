/**
 * @file packages/payload-ai-plugin/src/chat-context/pageDraftContextEndpoints.controller.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Предоставляет авторизованный каталог и точный текстовый снимок одной CMS-страницы.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import { parseIdentifier } from "@realize/ai-contracts";
import type { Endpoint } from "payload";
import { DEFAULT_API_ROUTE } from "../constants";
import { requireChatUser, requireDataManager } from "../endpoints/access";
import { EndpointError, success } from "../endpoints/http";
import { withHandler } from "../endpoints/request";
import { withCodexRuntime } from "../endpoints/withCodexRuntime.controller";
import { PageDraftUpdate } from "../endpoints/pageDraftUpdate.service";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { listPageDrafts } from "./listPageDrafts.repository";

/** Чтение контекста не предоставляет права изменения и не отправляет данные провайдеру. */
export const createPageDraftContextEndpoints = (
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] => [
  {
    path: `${DEFAULT_API_ROUTE}/chat/page-drafts`,
    method: "get",
    handler: withCodexRuntime(options, (options) =>
      withHandler(async (req, correlationID) => {
        await requireChatUser(req, options);
        await requireDataManager(req, options);
        if (!options.enabled || !options.pageDraft?.text)
          throw new EndpointError(
            "CONFLICT",
            "Контекст страниц сейчас недоступен.",
            409,
          );
        const params = new URL(req.url ?? "http://localhost").searchParams;
        const query = (params.get("q") ?? "").trim();
        const rawPage = params.get("page") ?? "1";
        if (query.length > 128 || !/^[1-9]\d{0,5}$/.test(rawPage))
          throw new EndpointError(
            "INVALID_REQUEST",
            "Некорректные параметры поиска страниц.",
            400,
          );
        return success(
          await listPageDrafts(req, query, Number(rawPage)),
          correlationID,
        );
      }),
    ),
  },
  {
    path: `${DEFAULT_API_ROUTE}/chat/page-drafts/:id`,
    method: "get",
    handler: withCodexRuntime(options, (options) =>
      withHandler(async (req, correlationID) => {
        await requireChatUser(req, options);
        await requireDataManager(req, options);
        if (!options.enabled || !options.pageDraft?.text)
          throw new EndpointError(
            "CONFLICT",
            "Контекст страниц сейчас недоступен.",
            409,
          );
        const id = parseIdentifier(req.routeParams?.id, "page id");
        return success(
          await new PageDraftUpdate(req.payload, req).readContext(id),
          correlationID,
        );
      }),
    ),
  },
];
