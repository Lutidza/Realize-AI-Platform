/**
 * @file packages/payload-ai-plugin/src/chat-context/chatContextEndpoints.controller.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Предоставляет закрытые вложения и каталог файлов только пользователю чата.
 */
import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_PROJECT_FILE_LIMIT,
  parseIdentifier,
} from "@realize/ai-contracts";
import type { ChatCapabilitiesDto } from "@realize/ai-contracts";
import type { Endpoint } from "payload";
import { DEFAULT_API_ROUTE } from "../constants";
import { requireChatUser, consumeRateLimit } from "../endpoints/access";
import { EndpointError, success } from "../endpoints/http";
import { withCodexRuntime } from "../endpoints/withCodexRuntime.controller";
import { withHandler } from "../endpoints/request";
import { getControlPlaneClient } from "../runtime/getControlPlaneClient";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { uploadChatAttachment } from "./uploadChatAttachment.service";
import { deleteChatAttachment } from "./deleteChatAttachment.service";
import { resolveOwnedChatAttachment } from "./resolveOwnedChatAttachment.service";
import { readChatUpload } from "./readChatUpload.service";

/** Все JSON ответы используют стандартный APIResponse, файловый ответ — авторизованный binary relay. */
export const createChatContextEndpoints = (
  options: SanitizedRealizeAIPluginOptions,
): Endpoint[] => [
  {
    path: `${DEFAULT_API_ROUTE}/chat/capabilities`,
    method: "get",
    handler: withCodexRuntime(options, (options) =>
      withHandler(async (req, correlationID) => {
        await requireChatUser(req, options);
        let capabilities: ChatCapabilitiesDto = {
          attachments: {
            ...CHAT_ATTACHMENT_LIMITS,
            mimeTypes: [...CHAT_ATTACHMENT_LIMITS.mimeTypes],
            extensions: [...CHAT_ATTACHMENT_LIMITS.extensions],
            available: false,
          },
          projectFiles: { available: false, maxFiles: CHAT_PROJECT_FILE_LIMIT },
          webSearch: { available: false },
        };
        if (options.enabled) {
          try {
            capabilities = await getControlPlaneClient(
              options,
            ).chatCapabilities(req.signal);
          } catch {
            /* Недоступность runtime явно отключает зависящие от него действия. */
          }
        }
        return success(capabilities, correlationID);
      }),
    ),
  },
  {
    path: `${DEFAULT_API_ROUTE}/chat/project-files`,
    method: "get",
    handler: withCodexRuntime(options, (options) =>
      withHandler(async (req, correlationID) => {
        await requireChatUser(req, options);
        if (!options.enabled)
          throw new EndpointError(
            "AI_DISABLED",
            options.runtimeStatus?.reason ?? "Административный агент выключен.",
            409,
          );
        const query =
          new URL(req.url ?? "http://localhost").searchParams.get("q") ?? "";
        if (query.length > 128)
          throw new EndpointError(
            "INVALID_REQUEST",
            "Поисковый запрос слишком длинный.",
            400,
          );
        try {
          return success(
            await getControlPlaneClient(options).projectFiles(
              query,
              req.signal,
            ),
            correlationID,
          );
        } catch {
          throw new EndpointError(
            "AI_RUNTIME_UNAVAILABLE",
            "Каталог файлов временно недоступен.",
            503,
          );
        }
      }),
    ),
  },
  {
    path: `${DEFAULT_API_ROUTE}/chat/attachments`,
    method: "post",
    handler: withCodexRuntime(options, (options) =>
      withHandler(async (req, correlationID) => {
        const user = await requireChatUser(req, options);
        consumeRateLimit(user.id);
        if (!options.enabled)
          throw new EndpointError("AI_DISABLED", "AI-чат отключён.", 409);
        const file = await readChatUpload(req);
        const attachment = await uploadChatAttachment(
          req,
          getControlPlaneClient(options),
          file,
          user.id,
        );
        return success(attachment, correlationID, 201);
      }),
    ),
  },
  {
    path: `${DEFAULT_API_ROUTE}/chat/attachments/:id/file`,
    method: "get",
    handler: withCodexRuntime(options, (options) =>
      withHandler(async (req) => {
        const user = await requireChatUser(req, options);
        const document = await resolveOwnedChatAttachment(
          req,
          getControlPlaneClient(options),
          parseIdentifier(req.routeParams?.id, "attachment id"),
          user.id,
        );
        let response: Response;
        try {
          response = await getControlPlaneClient(options).downloadChatAsset(
            document.assetID,
            req.signal,
          );
        } catch {
          throw new EndpointError(
            "NOT_FOUND",
            "Файл недоступен или срок его хранения истёк.",
            404,
          );
        }
        return new Response(response.body, {
          headers: {
            "Content-Type": document.mimeType,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Content-Disposition": `${document.kind === "image" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(document.name)}`,
          },
        });
      }),
    ),
  },
  {
    path: `${DEFAULT_API_ROUTE}/chat/attachments/:id`,
    method: "delete",
    handler: withCodexRuntime(options, (options) =>
      withHandler(async (req, correlationID) => {
        const user = await requireChatUser(req, options);
        await deleteChatAttachment(
          req,
          getControlPlaneClient(options),
          parseIdentifier(req.routeParams?.id, "attachment id"),
          user.id,
        );
        return success({ deleted: true }, correlationID);
      }),
    ),
  },
];
