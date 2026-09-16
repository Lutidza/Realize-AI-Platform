/**
 * @file src/collections/Media/queueMediaProcessingSet.service.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Атомарно фиксирует рецепт и native задание обработки выбранного Media.
 * @see documentation/specifications/media-management.md
 */
import { createHash } from "node:crypto";
import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
} from "payload";
import { checkRole } from "@/access/utilities";
import { createMediaInternalRequest } from "./createMediaInternalRequest.service";
import { readMediaProfileSnapshot } from "./readMediaProfileSnapshot.service";
import { mediaPipelineVersion } from "./processMediaVariants.service";
import { lockMediaTransaction } from "./lockMediaTransaction.repository";

/** Повтор выбора той же версии возвращает прежний набор и не создаёт новые URL. */
export async function queueMediaProcessingSet({
  req,
  mediaID,
  originalID,
  profileID,
}: {
  req: PayloadRequest;
  mediaID: number;
  originalID: number;
  profileID: number;
}) {
  if (!req.user || !checkRole(["admin"], req.user))
    throw new APIError("Необходим доступ администратора.", 403);
  const commit = await initTransaction(req);
  try {
    await lockMediaTransaction(req, mediaID);
    const snapshot = await readMediaProfileSnapshot({
      payload: req.payload,
      req,
      profileID,
    });
    const internal = await createMediaInternalRequest(req);
    const original = await req.payload.findByID({
      collection: "media-originals",
      id: originalID,
      req: internal,
      depth: 0,
      overrideAccess: true,
    });
    if (original.media !== mediaID)
      throw new APIError("Исходник не принадлежит выбранному Media.", 409);
    const recipeHash = createHash("sha256")
      .update(JSON.stringify(snapshot.recipe))
      .digest("hex");
    const requestKey = createHash("sha256")
      .update(
        JSON.stringify({
          mediaID,
          originalID,
          recipeHash,
          pipelineVersion: mediaPipelineVersion,
        }),
      )
      .digest("hex");
    const found = await req.payload.find({
      collection: "media-processing-sets",
      req: internal,
      depth: 0,
      overrideAccess: true,
      limit: 1,
      where: { requestKey: { equals: requestKey } },
    });
    if (found.docs[0]) {
      if (commit) await commitTransaction(req);
      return found.docs[0];
    }
    const set = await req.payload.create({
      collection: "media-processing-sets",
      req: internal,
      overrideAccess: true,
      depth: 0,
      data: {
        media: mediaID,
        original: originalID,
        profile: profileID,
        profileName: snapshot.profileName,
        profileVersion: snapshot.profileVersionID,
        sourceHash: original.sourceHash,
        recipe: {
          ...snapshot.recipe,
          variants: snapshot.recipe.variants.map((variant) => ({ ...variant })),
        },
        recipeHash,
        requestKey,
        pipelineVersion: mediaPipelineVersion,
        requestedBy: req.user.id,
        status: "queued",
        manualRetries: 0,
      },
    });
    const job = await req.payload.jobs.queue({
      task: "processMedia",
      queue: "media",
      req: internal,
      input: { setID: set.id },
    });
    const queued = await req.payload.update({
      collection: "media-processing-sets",
      id: set.id,
      req: internal,
      overrideAccess: true,
      depth: 0,
      data: { job: job.id },
    });
    if (commit) await commitTransaction(req);
    return queued;
  } catch (error) {
    if (commit) await killTransaction(req);
    throw error;
  }
}
