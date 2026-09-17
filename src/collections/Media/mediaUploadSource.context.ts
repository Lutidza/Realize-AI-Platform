/**
 * @file src/collections/Media/mediaUploadSource.context.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Передаёт исходные байты между native upload hooks в контексте одного запроса.
 * @see documentation/specifications/media-management.md
 */
import type { PayloadRequest } from "payload";
import type { MediaUploadSource } from "./MediaProcessing.types";

/** WeakMap не удерживает завершённый запрос; afterChange забирает и удаляет его исходник. */
export const pendingSources = new WeakMap<PayloadRequest, MediaUploadSource>();
export const supportedImages = ["image/jpeg", "image/png", "image/webp"];
