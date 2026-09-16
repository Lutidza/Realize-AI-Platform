/**
 * @file src/collections/Media/processMedia.task.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Исполняет зафиксированный рецепт native Jobs и открывает только полный проверенный набор.
 * @see documentation/specifications/media-management.md
 */
import { createHash } from "node:crypto";
import { type TaskConfig } from "payload";
import { checkRole } from "@/access/utilities";
import { createMediaInternalRequest } from "./createMediaInternalRequest.service";
import {
  mediaPipelineVersion,
  processMediaVariants,
} from "./processMediaVariants.service";
import { validateMediaRecipe } from "./validateMediaRecipe.validator";
import { readStoredMediaFile } from "./readStoredMediaFile.service";
import { mediaStoragePaths } from "./mediaStoragePaths.config";

export const processMediaTask: TaskConfig<{
  input: { setID: number };
  output: { resultHash: string };
}> = {
  slug: "processMedia",
  inputSchema: [{ name: "setID", type: "number", required: true }],
  outputSchema: [{ name: "resultHash", type: "text", required: true }],
  retries: { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
  handler: async ({ input, job, req }) => {
    if (!Number.isSafeInteger(input.setID) || input.setID < 1)
      throw new Error("Недопустимый набор Media.");
    const internal = await createMediaInternalRequest(req);
    const payload = req.payload;
    const set = await payload.findByID({
      collection: "media-processing-sets",
      id: input.setID,
      req: internal,
      overrideAccess: true,
      depth: 0,
    });
    if (set.job !== job.id || job.queue !== "media")
      throw new Error("Задание не принадлежит этому набору Media.");
    if (set.status === "ready" && set.resultHash)
      return { output: { resultHash: set.resultHash } };
    try {
      if (
        typeof set.requestedBy !== "number" ||
        typeof set.original !== "number"
      )
        throw new Error("Недоступен источник задания.");
      const actor = await payload.findByID({
        collection: "users",
        id: set.requestedBy,
        req: internal,
        overrideAccess: true,
        depth: 0,
      });
      if (!checkRole(["admin"], actor))
        throw new Error("Инициатор больше не имеет доступа администратора.");
      if (set.pipelineVersion !== mediaPipelineVersion)
        throw new Error(
          "Обработчик обновлён: подготовьте новый набор с текущей версией.",
        );
      await payload.update({
        collection: "media-processing-sets",
        id: set.id,
        req: internal,
        overrideAccess: true,
        data: { status: "processing", error: null },
      });
      const original = await payload.findByID({
        collection: "media-originals",
        id: set.original,
        req: internal,
        overrideAccess: true,
        depth: 0,
      });
      const source = await readStoredMediaFile(
        mediaStoragePaths.originals,
        original.filename,
      );
      const processed = await processMediaVariants({
        source,
        recipe: validateMediaRecipe(set.recipe),
      });
      if (
        processed.sourceHash !== set.sourceHash ||
        original.sourceHash !== set.sourceHash ||
        processed.recipeHash !== set.recipeHash
      )
        throw new Error(
          "Контрольная сумма источника или рецепта не совпадает.",
        );
      for (const variant of processed.variants) {
        const variantKey = `${set.id}:${variant.slot}:${variant.format}`;
        const found = await payload.find({
          collection: "media-variants",
          req: internal,
          overrideAccess: true,
          depth: 0,
          limit: 1,
          where: { variantKey: { equals: variantKey } },
        });
        const stored =
          found.docs[0] ??
          (await payload.create({
            collection: "media-variants",
            req: internal,
            overrideAccess: true,
            depth: 0,
            data: {
              set: set.id,
              variantKey,
              slot: variant.slot,
              format: variant.format,
              contentHash: variant.contentHash,
            },
            file: {
              data: variant.data,
              name: `${set.id}-${variant.filename}`,
              mimetype: variant.mimeType,
              size: variant.byteLength,
            },
          }));
        // Native upload не должен повторно кодировать WebP и менять hash результата.
        const bytes = await readStoredMediaFile(
          mediaStoragePaths.variants,
          stored.filename,
          64 * 1024 * 1024,
        );
        if (
          stored.contentHash !== variant.contentHash ||
          stored.width !== variant.width ||
          stored.height !== variant.height ||
          createHash("sha256").update(bytes).digest("hex") !==
            variant.contentHash
        )
          throw new Error("Сохранённый вариант не прошёл проверку.");
      }
      const currentJob = await payload.findByID({
        collection: "payload-jobs",
        id: job.id,
        req: internal,
        overrideAccess: true,
        depth: 0,
      });
      if (currentJob.hasError) throw new Error("Обработка остановлена.");
      await payload.update({
        collection: "media-processing-sets",
        id: set.id,
        req: internal,
        overrideAccess: true,
        data: {
          status: "ready",
          error: null,
          resultHash: processed.variantSetID,
        },
      });
      return { output: { resultHash: processed.variantSetID } };
    } catch (error) {
      // Техническая ошибка остаётся в native Jobs; UI не получает пути или stack trace.
      await payload.update({
        collection: "media-processing-sets",
        id: set.id,
        req: internal,
        overrideAccess: true,
        data: {
          status: "failed",
          error:
            "Не удалось создать варианты. Проверьте формат, прозрачность и настройки профиля; затем повторите обработку.",
        },
      });
      throw error;
    }
  },
};
