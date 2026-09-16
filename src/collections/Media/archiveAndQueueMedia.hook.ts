/**
 * @file src/collections/Media/archiveAndQueueMedia.hook.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Сохраняет приватный исходник и ставит выбранный профиль в native очередь после записи Media.
 * @see documentation/specifications/media-management.md
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { APIError, type CollectionAfterChangeHook } from "payload";
import type { Media } from "@/payload-types";
import { createMediaInternalRequest } from "./createMediaInternalRequest.service";
import { prepareMediaDisplayCopy } from "./prepareMediaDisplayCopy.service";
import { readStoredMediaFile } from "./readStoredMediaFile.service";
import { queueMediaProcessingSet } from "./queueMediaProcessingSet.service";
import { pendingSources, supportedImages } from "./mediaUploadSource.context";

/** Связь source + intent + job использует транзакцию native Media create/update. */
export const archiveAndQueueMedia: CollectionAfterChangeHook<Media> = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (req.context.mediaProcessingInternal === true) return doc;
  let source = pendingSources.get(req);
  pendingSources.delete(req);
  const profileID =
    typeof doc.processingProfile === "number"
      ? doc.processingProfile
      : doc.processingProfile?.id;
  let originalID =
    typeof doc.original === "number" ? doc.original : doc.original?.id;
  const internal = await createMediaInternalRequest(req);
  let provenance: "uploaded" | "legacy-copy" = "uploaded";
  if (!source && !originalID && profileID) {
    if (!supportedImages.includes(doc.mimeType ?? ""))
      throw new APIError("Для этого файла обработка профилем недоступна.", 400);
    source = {
      data: await readStoredMediaFile(
        path.resolve(process.cwd(), "public/media"),
        doc.filename,
      ),
      name: doc.filename!,
      mimetype: doc.mimeType!,
    };
    // Старый публичный файл не выдаётся за первоначальные байты до Payload обработки.
    await prepareMediaDisplayCopy(source.data);
    provenance = "legacy-copy";
  }
  if (source && !originalID) {
    const original = await req.payload.create({
      collection: "media-originals",
      req: internal,
      overrideAccess: true,
      depth: 0,
      data: {
        media: doc.id,
        sourceHash: createHash("sha256").update(source.data).digest("hex"),
        provenance,
        alt: doc.alt,
      },
      file: { ...source, size: source.data.length },
    });
    originalID = original.id;
    await req.payload.update({
      collection: "media",
      id: doc.id,
      req: internal,
      overrideAccess: true,
      depth: 0,
      data: { original: originalID, managedDisplay: provenance === "uploaded" },
    });
    doc.original = originalID;
    doc.managedDisplay = provenance === "uploaded";
  }
  const oldProfileID =
    typeof previousDoc?.processingProfile === "number"
      ? previousDoc.processingProfile
      : previousDoc?.processingProfile?.id;
  if (profileID && originalID && (source || oldProfileID !== profileID)) {
    await queueMediaProcessingSet({
      req,
      mediaID: doc.id,
      originalID,
      profileID,
    });
  }
  return doc;
};
