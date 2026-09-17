/**
 * @file src/collections/Media/deleteMediaProcessing.hook.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Удаляет технические записи и файлы после успешного native удаления Media.
 * @see documentation/specifications/media-management.md
 */
import { APIError, type CollectionAfterDeleteHook } from "payload";
import type { Media } from "@/payload-types";
import { createMediaInternalRequest } from "./createMediaInternalRequest.service";

/** Media.forceSelect сохраняет original даже при ограниченном REST select результата удаления. */
export const deleteMediaProcessing: CollectionAfterDeleteHook<Media> = async ({
  doc,
  req,
}) => {
  const originalID =
    typeof doc.original === "number" ? doc.original : doc.original?.id;
  if (!originalID) return doc;
  const internal = await createMediaInternalRequest(req);
  for (;;) {
    const sets = await req.payload.find({
      collection: "media-processing-sets",
      req: internal,
      overrideAccess: true,
      depth: 0,
      limit: 5,
      // FK media уже очищен native DELETE; неизменяемый original связывает всю цепочку.
      where: { original: { equals: originalID } },
    });
    if (!sets.docs.length) break;
    for (const set of sets.docs) {
      const variants = await req.payload.delete({
        collection: "media-variants",
        req: internal,
        overrideAccess: true,
        where: { set: { equals: set.id } },
      });
      if (variants.errors.length)
        throw new APIError("Не удалось полностью удалить варианты Media.", 500);
      // Старые ручные retries принадлежат тому же setID; чужие задания не затрагиваются.
      const jobs = await req.payload.delete({
        collection: "payload-jobs",
        req: internal,
        overrideAccess: true,
        where: {
          and: [
            { taskSlug: { equals: "processMedia" } },
            { queue: { equals: "media" } },
            { "input.setID": { equals: set.id } },
          ],
        },
      });
      if (jobs.errors.length)
        throw new APIError("Не удалось полностью удалить задания Media.", 500);
      await req.payload.delete({
        collection: "media-processing-sets",
        id: set.id,
        req: internal,
        overrideAccess: true,
      });
    }
  }
  await req.payload.delete({
    collection: "media-originals",
    id: originalID,
    req: internal,
    overrideAccess: true,
  });
  return doc;
};
