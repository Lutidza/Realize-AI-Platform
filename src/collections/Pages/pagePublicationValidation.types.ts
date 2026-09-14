/**
 * @file src/collections/Pages/pagePublicationValidation.types.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Задаёт закрытое состояние ограниченной проверки публикации без проекции страницы.
 */
import type { PagePublicationCheckDTO } from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";

export type PagePublicationValidationContext = {
  req: PayloadRequest;
  checks: PagePublicationCheckDTO[];
  nodes: number;
};
