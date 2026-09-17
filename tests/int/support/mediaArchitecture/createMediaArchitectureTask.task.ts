/**
 * @file tests/int/support/mediaArchitecture/createMediaArchitectureTask.task.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Выполняет snapshot-рецепт через Sharp и сохраняет готовые файлы native upload.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { APIError, type TaskConfig } from "payload";
import { processMediaVariants } from "../../../../src/collections/Media/processMediaVariants.service";
import type { MediaRecipe } from "../../../../src/collections/Media/MediaProcessing.types";
import { mediaArchitectureAPI } from "./mediaArchitecture.adapter";

/** Только test collection; storageRoot задаётся владельцем disposable lifecycle. */
export const createMediaArchitectureTask = (
  storageRoot: string,
): TaskConfig<{
  input: { intentID: string };
  output: { variantSetID: string };
}> => ({
  slug: "mediaArchitectureProcess",
  inputSchema: [{ name: "intentID", type: "text", required: true }],
  outputSchema: [{ name: "variantSetID", type: "text", required: true }],
  retries: 2,
  handler: async ({ input, req }) => {
    if (!req.user) throw new APIError("Необходима авторизация proof.", 403);
    const api = mediaArchitectureAPI(req.payload);
    const intent = await api.findByID({
      collection: "proof-intents",
      id: input.intentID,
      req,
      overrideAccess: false,
      depth: 0,
    });
    if (intent.status === "ready" && typeof intent.variantSetID === "string") {
      return { output: { variantSetID: intent.variantSetID } };
    }
    if (typeof intent.originalID !== "number")
      throw new Error("Invalid proof original reference");
    const original = await api.findByID({
      collection: "proof-originals",
      id: intent.originalID,
      req,
      overrideAccess: false,
      depth: 0,
    });
    if (
      typeof original.filename !== "string" ||
      path.basename(original.filename) !== original.filename
    )
      throw new Error("Invalid proof filename");
    const source = await readFile(
      path.join(storageRoot, "originals", original.filename),
    );
    // Production processor validates this JSON snapshot before any transformation.
    const processed = await processMediaVariants({
      source,
      recipe: intent.recipe as MediaRecipe,
    });
    if (processed.sourceHash !== intent.sourceHash)
      throw new Error("Proof original changed");
    for (const variant of processed.variants) {
      const existing = await api.find({
        collection: "proof-variants",
        req,
        overrideAccess: false,
        depth: 0,
        limit: 2,
        where: {
          resultKey: {
            equals: `${processed.variantSetID}:${variant.slot}:${variant.format}`,
          },
        },
      });
      if (existing.docs.length > 1) throw new Error("Duplicate proof variant");
      if (existing.docs[0]) {
        const doc = existing.docs[0];
        if (
          doc.contentHash !== variant.contentHash ||
          typeof doc.filename !== "string" ||
          path.basename(doc.filename) !== doc.filename
        )
          throw new Error("Inconsistent proof variant");
        const bytes = await readFile(
          path.join(storageRoot, "variants", doc.filename),
        );
        if (
          createHash("sha256").update(bytes).digest("hex") !==
          variant.contentHash
        )
          throw new Error("Proof variant bytes changed");
        continue;
      }
      await api.create({
        collection: "proof-variants",
        req,
        overrideAccess: false,
        data: {
          resultKey: `${processed.variantSetID}:${variant.slot}:${variant.format}`,
          variantSetID: processed.variantSetID,
          sourceHash: processed.sourceHash,
          recipeHash: processed.recipeHash,
          pipelineVersion: processed.pipelineVersion,
          slot: variant.slot,
          format: variant.format,
          contentHash: variant.contentHash,
        },
        file: {
          data: variant.data,
          mimetype: variant.mimeType,
          name: variant.filename,
          size: variant.byteLength,
        },
      });
    }
    // Fail after durable native files, before completion, to exercise real Jobs retry.
    if (intent.failOnce && !intent.failedOnce) {
      await api.update({
        collection: "proof-intents",
        id: intent.id,
        req,
        overrideAccess: false,
        data: { failedOnce: true },
      });
      throw new Error("Intentional media proof retry");
    }
    await api.update({
      collection: "proof-intents",
      id: intent.id,
      req,
      overrideAccess: false,
      data: { status: "ready", variantSetID: processed.variantSetID },
    });
    return { output: { variantSetID: processed.variantSetID } };
  },
});
