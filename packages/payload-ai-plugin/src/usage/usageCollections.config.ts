/**
 * @file packages/payload-ai-plugin/src/usage/usageCollections.config.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Регистрирует закрытые ledger, projections, тарифы и резервы без обычного CRUD-доступа.
 */
import type { CollectionConfig, Field } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "../collections/access";
import { USAGE_COLLECTION_SLUGS } from "./usage.constants";

export function createUsageCollections(
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig[] {
  const { deny } = createCollectionAccess();
  const text = (name: string, extra: Partial<Field> = {}): Field =>
    ({ name, type: "text", required: true, ...extra }) as Field;
  const json = (name: string): Field => ({
    name,
    type: "json",
    required: true,
  });
  const identity = [
    text("installationId", { index: true }),
    text("projectId", { index: true }),
  ];
  const definitions: Array<{ slug: string; fields: Field[] }> = [
    {
      slug: USAGE_COLLECTION_SLUGS[0],
      fields: [
        text("attemptId", { unique: true }),
        ...identity,
        text("purpose", { index: true }),
        text("source", { index: true }),
        text("taskId", { index: true }),
        { name: "startedAt", type: "date", required: true, index: true },
        json("record"),
      ],
    },
    {
      slug: USAGE_COLLECTION_SLUGS[1],
      fields: [
        text("eventId", { unique: true }),
        text("subjectKey", { index: true }),
        text("kind", { index: true }),
        json("event"),
        text("contentHash"),
      ],
    },
    {
      slug: USAGE_COLLECTION_SLUGS[2],
      fields: [
        text("pricingId", { unique: true }),
        text("installationId", { index: true }),
        text("basis", { index: true }),
        text("provider"),
        text("model", { index: true }),
        text("authMode"),
        { name: "effectiveFrom", type: "date", required: true, index: true },
        json("snapshot"),
      ],
    },
    {
      slug: USAGE_COLLECTION_SLUGS[3],
      fields: [
        text("accountKey", { unique: true }),
        ...identity,
        text("purpose"),
        text("basis"),
        json("policy"),
      ],
    },
    {
      slug: USAGE_COLLECTION_SLUGS[4],
      fields: [
        text("storageKey", { unique: true }),
        text("accountKey", { index: true }),
        text("attemptId", { index: true }),
        text("period", { index: true }),
        text("currency"),
        text("basis"),
        text("amountNanos"),
        text("state", { index: true }),
      ],
    },
  ];
  return definitions.map(({ slug, fields }) => ({
    slug,
    fields,
    access: { create: deny, read: deny, update: deny, delete: deny },
    admin: { hidden: true, group: options.admin.group },
    timestamps: true,
    versions: false,
  }));
}
