/**
 * @file src/collections/Media/createMediaInternalRequest.service.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Изолирует серверные полномочия Media, сохраняя транзакцию вызывающего запроса.
 * @see documentation/specifications/media-management.md
 */
import { createLocalReq, type PayloadRequest } from "payload";

/** Native Local API меняет req.context/file; копия не повышает права исходного запроса. */
export function createMediaInternalRequest(req: PayloadRequest) {
  return createLocalReq(
    {
      req: {
        ...req,
        file: undefined,
        query: {},
        context: { ...req.context, mediaProcessingInternal: true },
      },
    },
    req.payload,
  );
}
