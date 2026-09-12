/**
 * @file packages/change-engine/src/PageDraftPolicy.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт привязки рецепта страницы и её неизменённого черновика к подтверждению.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type { CreatePageDraftIntent } from "@realize/ai-contracts";

/** createDataHash связывает intent с точным server-owned Payload snapshot и версией mapper. */
export type PageDraftOperationHashInput = {
  createDataHash: string;
  intent: CreatePageDraftIntent;
  mapperVersion: string;
};

/** После создания все три поля результата обязательны для подтверждаемого удаления. */
export type PageDraftRollbackHashInput = {
  operationHash: string;
} & (
  | { fingerprint: string; pageID: string; updatedAt: string }
  | { fingerprint?: never; pageID?: never; updatedAt?: never }
);
