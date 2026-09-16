/**
 * @file src/collections/Media/mediaProcessing.endpoints.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Предоставляет административные команды обработки и ограниченный DTO карточки Media.
 * @see documentation/specifications/media-management.md
 */
import { APIError, type Endpoint, type PayloadRequest } from "payload";
import { checkRole } from "@/access/utilities";
import { queueMediaProcessingSet } from "./queueMediaProcessingSet.service";
import { retryMediaProcessingSet } from "./retryMediaProcessingSet.service";
import { readMediaProcessingStatus } from "./readMediaProcessingStatus.service";

function identifier(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d{0,9}$/.test(value) ||
    Number(value) > 2147483647
  )
    throw new APIError("Недопустимый идентификатор.", 400);
  return Number(value);
}

function handler(
  action: (req: PayloadRequest, id: number) => Promise<unknown>,
): Endpoint["handler"] {
  return async (req) => {
    try {
      if (!req.user || !checkRole(["admin"], req.user))
        throw new APIError("Необходим доступ администратора.", 403);
      const id = identifier(req.routeParams?.id);
      const data = await action(req, id);
      return Response.json(data, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof APIError
              ? error.message
              : "Операция обработки недоступна. Повторите позже.",
        },
        { status: error instanceof APIError ? error.status : 500 },
      );
    }
  };
}

export const mediaProcessingEndpoints: Endpoint[] = [
  {
    path: "/:id/processing",
    method: "get",
    handler: handler(async (req, id) => {
      const page = req.query?.page == null ? 1 : identifier(req.query.page);
      return readMediaProcessingStatus(req, id, page);
    }),
  },
  {
    path: "/:id/processing",
    method: "post",
    handler: handler(async (req, id) => {
      const media = await req.payload.findByID({
        collection: "media",
        id,
        req,
        overrideAccess: false,
        depth: 0,
      });
      if (
        typeof media.original !== "number" ||
        typeof media.processingProfile !== "number"
      )
        throw new APIError(
          "Выберите профиль и сохраните файл перед обработкой.",
          400,
        );
      const set = await queueMediaProcessingSet({
        req,
        mediaID: id,
        originalID: media.original,
        profileID: media.processingProfile,
      });
      return { setID: set.id };
    }),
  },
  {
    path: "/:id/processing/:setID/retry",
    method: "post",
    handler: handler(async (req, id) => {
      await retryMediaProcessingSet(
        req,
        id,
        identifier(req.routeParams?.setID),
      );
      return { queued: true };
    }),
  },
];
