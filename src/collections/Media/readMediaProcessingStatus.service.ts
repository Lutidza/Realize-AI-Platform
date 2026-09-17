/**
 * @file src/collections/Media/readMediaProcessingStatus.service.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Читает ограниченную страницу наборов и отображает итог native retries без утечки job payload.
 * @see documentation/specifications/media-management.md
 */
import type { PayloadRequest } from "payload";
import type { MediaProcessingStatusDTO } from "./MediaProcessingStatus.types";
import { createMediaInternalRequest } from "./createMediaInternalRequest.service";

/** Только вызывающий endpoint проверяет admin; raw документы не пересекают границу. */
export async function readMediaProcessingStatus(
  req: PayloadRequest,
  mediaID: number,
  page = 1,
): Promise<MediaProcessingStatusDTO> {
  const media = await req.payload.findByID({
    collection: "media",
    id: mediaID,
    req,
    overrideAccess: false,
    depth: 0,
  });
  const internal = await createMediaInternalRequest(req);
  const base = req.payload.config.routes.api;
  const original =
    typeof media.original === "number"
      ? await req.payload.findByID({
          collection: "media-originals",
          id: media.original,
          req,
          overrideAccess: false,
          depth: 0,
        })
      : null;
  const result = await req.payload.find({
    collection: "media-processing-sets",
    req,
    overrideAccess: false,
    depth: 0,
    limit: 5,
    page,
    sort: "-id",
    where: { media: { equals: mediaID } },
  });
  const sets: MediaProcessingStatusDTO["sets"] = [];
  for (const set of result.docs) {
    const job =
      typeof set.job === "number"
        ? await req.payload.findByID({
            collection: "payload-jobs",
            id: set.job,
            req: internal,
            overrideAccess: true,
            depth: 0,
          })
        : null;
    const terminal = !!job?.hasError;
    const status =
      set.status === "ready"
        ? "ready"
        : terminal
          ? "failed"
          : job?.processing
            ? "processing"
            : "queued";
    const variants =
      status === "ready"
        ? await req.payload.find({
            collection: "media-variants",
            req,
            overrideAccess: false,
            depth: 0,
            limit: 16,
            sort: "slot",
            where: { set: { equals: set.id } },
          })
        : null;
    sets.push({
      id: set.id,
      profileName: set.profileName,
      profileVersion: set.profileVersion,
      status,
      error: terminal
        ? set.error || "Обработка прервалась. Повторите её в карточке файла."
        : null,
      canRetry:
        terminal &&
        !job?.processing &&
        (set.manualRetries ?? 0) < 3 &&
        set.status !== "ready",
      createdAt: set.createdAt,
      variants: (variants?.docs ?? []).flatMap((variant) =>
        variant.filename && variant.width && variant.height && variant.filesize
          ? [
              {
                id: variant.id,
                slot: variant.slot,
                format: variant.format,
                url: `${base}/media-variants/file/${encodeURIComponent(variant.filename)}`,
                width: variant.width,
                height: variant.height,
                filesize: variant.filesize,
              },
            ]
          : [],
      ),
    });
  }
  return {
    original: original?.filename
      ? {
          filename: original.filename,
          provenance: original.provenance,
          url: `${base}/media-originals/file/${encodeURIComponent(original.filename)}`,
        }
      : null,
    sets,
    hasMore: result.hasNextPage,
  };
}
