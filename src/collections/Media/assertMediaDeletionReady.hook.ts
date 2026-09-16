/**
 * @file src/collections/Media/assertMediaDeletionReady.hook.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Проверяет полномочия и завершение обработки перед штатным удалением Media.
 * @see documentation/specifications/media-management.md
 */
import { APIError, type CollectionBeforeDeleteHook } from "payload";
import { checkRole } from "@/access/utilities";
import { createMediaInternalRequest } from "./createMediaInternalRequest.service";
import { lockMediaTransaction } from "./lockMediaTransaction.repository";

/** BeforeDelete не удаляет файлы: native deleteByID ещё не проверил блокировку редактора. */
export const assertMediaDeletionReady: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  if (!checkRole(["admin"], req.user))
    throw new APIError("Необходим доступ администратора.", 403);
  const mediaID = Number(id);
  await lockMediaTransaction(req, mediaID);
  const internal = await createMediaInternalRequest(req);
  const busy = await req.payload.find({
    collection: "media-processing-sets",
    req: internal,
    overrideAccess: true,
    depth: 0,
    limit: 1,
    where: {
      and: [
        { media: { equals: mediaID } },
        {
          or: [
            { "job.processing": { equals: true } },
            {
              and: [
                { status: { not_equals: "ready" } },
                { "job.hasError": { not_equals: true } },
              ],
            },
          ],
        },
      ],
    },
  });
  if (busy.docs.length)
    throw new APIError(
      "Дождитесь завершения обработки перед удалением файла.",
      409,
    );
};
