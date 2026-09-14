/**
 * @file packages/payload-ai-plugin/src/endpoints/PagePublication.types.ts
 * @version 2.0.0
 * @date 2026-09-14
 * @description Серверные права, политика и закрытые снимки публикации Pages.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type {
  PagePublicationCheckDTO,
  PagePublicationPreviewDTO,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import type { PageDraftRevision } from "./PageDraftUpdate.types";
import type { AIDocument } from "./repository";

/** Host явно определяет право публикации, поддержанные зависимости и post-commit invalidation. */
export type PagePublicationAdapter = {
  version: "1.0";
  canPublish: (req: PayloadRequest) => boolean | Promise<boolean>;
  check: (
    page: Record<string, unknown>,
    req: PayloadRequest,
  ) => Promise<{
    checks: PagePublicationCheckDTO[];
    policyHash: string;
  }>;
  revalidate: (slugs: string[], req: PayloadRequest) => Promise<void>;
};
export type PagePublicationSource = {
  id: string;
  version: number;
  operationHash: string;
};
/** Private snapshots не пересекают browser/API boundary. */
export type PagePublicationSnapshot = {
  version: "1.0";
  mode: "publish" | "restore";
  source: PagePublicationSource;
  /** Новые планы связывают каталог; сохранённая история прежнего формата остаётся читаемой. */
  catalogHash?: string;
  revision: PageDraftRevision;
  beforePage: AIDocument;
  targetPage: AIDocument;
  preservedDraft: AIDocument;
  preview: PagePublicationPreviewDTO;
};
export type AppliedPagePublicationSnapshot = {
  pageID: string;
  title: string;
  slug: string;
  updatedAt: string;
  adminUrl: string;
  publicUrl?: string;
  baseFingerprint: string;
  revision: PageDraftRevision;
};
