/**
 * @file src/collections/Media/mediaFileAccess.policy.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Ограничивает запись технических Media и выдачу native файлов по существующим записям.
 * @see documentation/specifications/media-management.md
 */
import type { Access, PayloadRequest } from "payload";
import { checkRole } from "@/access/utilities";

/** Контекст устанавливает только серверный сервис, не данные REST/GraphQL документа. */
export function isMediaProcessingInternal(req: PayloadRequest): boolean {
  return req.context?.mediaProcessingInternal === true;
}

export const mediaProcessingInternalAccess: Access = ({ req }) =>
  isMediaProcessingInternal(req);

// Where заставляет native file endpoint проверить запись даже для администратора.
export const readMediaOriginal: Access = ({ req }) =>
  checkRole(["admin"], req.user) ? { id: { exists: true } } : false;

// Неполный набор и файл без DB-записи не становятся публичными по известному имени.
export const readReadyMediaVariant: Access = () => ({
  "set.status": { equals: "ready" },
});
