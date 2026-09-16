/**
 * @file src/collections/Media/retryMediaProcessingSet.service.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Повторяет завершившееся ошибкой задание с прежним снимком и адресной блокировкой.
 * @see documentation/specifications/media-management.md
 */
import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
} from "payload";
import { createMediaInternalRequest } from "./createMediaInternalRequest.service";
import { lockMediaTransaction } from "./lockMediaTransaction.repository";

export async function retryMediaProcessingSet(
  req: PayloadRequest,
  mediaID: number,
  setID: number,
) {
  const commit = await initTransaction(req);
  try {
    await lockMediaTransaction(req, mediaID);
    const internal = await createMediaInternalRequest(req);
    const set = await req.payload.findByID({
      collection: "media-processing-sets",
      id: setID,
      req,
      overrideAccess: false,
      depth: 0,
    });
    if (set.media !== mediaID || typeof set.job !== "number")
      throw new APIError("Набор не принадлежит выбранному файлу.", 404);
    const job = await req.payload.findByID({
      collection: "payload-jobs",
      id: set.job,
      req: internal,
      overrideAccess: true,
      depth: 0,
    });
    if (set.status === "ready" || job.processing || !job.hasError)
      throw new APIError(
        "Повтор доступен после завершения обработки с ошибкой.",
        409,
      );
    if ((set.manualRetries ?? 0) >= 3)
      throw new APIError(
        "Достигнут предел повторов. Проверьте настройки и подготовьте новый набор.",
        409,
      );
    const queued = await req.payload.jobs.queue({
      req: internal,
      task: "processMedia",
      queue: "media",
      input: { setID: set.id },
    });
    await req.payload.update({
      collection: "media-processing-sets",
      id: set.id,
      req: internal,
      overrideAccess: true,
      data: {
        job: queued.id,
        status: "queued",
        error: null,
        manualRetries: (set.manualRetries ?? 0) + 1,
      },
    });
    if (commit) await commitTransaction(req);
  } catch (error) {
    if (commit) await killTransaction(req);
    throw error;
  }
}
