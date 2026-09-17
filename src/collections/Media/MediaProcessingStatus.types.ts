/**
 * @file src/collections/Media/MediaProcessingStatus.types.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Описывает ограниченный admin DTO исходника и страниц готовых наборов.
 * @see documentation/specifications/media-management.md
 */
export type MediaProcessingStatusDTO = {
  original: {
    url: string;
    filename: string;
    provenance: "uploaded" | "legacy-copy";
  } | null;
  sets: {
    id: number;
    profileName: string;
    profileVersion: number;
    status: "queued" | "processing" | "ready" | "failed";
    error: string | null;
    canRetry: boolean;
    createdAt: string;
    variants: {
      id: number;
      slot: string;
      format: string;
      url: string;
      width: number;
      height: number;
      filesize: number;
    }[];
  }[];
  hasMore: boolean;
};
