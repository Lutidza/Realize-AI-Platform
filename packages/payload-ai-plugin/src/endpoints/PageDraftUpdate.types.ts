/**
 * @file packages/payload-ai-plugin/src/endpoints/PageDraftUpdate.types.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Задаёт закрытые снимки версии, изменения и отката текста страницы.
 */
import type {
  PageDraftContextDTO,
  PageDraftUpdatePreviewDTO,
} from "@realize/ai-contracts";
import type {
  AppliedPageDraftSnapshot,
  PageDraftAdapter,
} from "./PageDraft.types";
import type { AIDocument } from "./repository";

export type PageDraftTextAdapter = NonNullable<PageDraftAdapter["text"]>;

/** Последняя версия и основная строка читаются под общим Pages transaction lock. */
export type PageDraftRevision = {
  page: AIDocument;
  baseFingerprint: string;
  publicationFingerprint: string;
  latestVersion: { id: string; updatedAt: string };
};

/** Полный исходный документ хранится только на сервере для точного обратного patch. */
export type PageDraftUpdateSnapshot = {
  context: PageDraftContextDTO;
  beforePage: AIDocument;
  writeData: Record<string, unknown>;
  expectedPage: AIDocument;
  baseFingerprint: string;
  publicationFingerprint: string;
  preview: PageDraftUpdatePreviewDTO;
};

export type AppliedPageDraftUpdateSnapshot = AppliedPageDraftSnapshot & {
  adapterVersion: string;
};

export type PageDraftUpdateLocalAPI = {
  find: (args: Record<string, unknown>) => Promise<{ docs: AIDocument[] }>;
  findVersions: (
    args: Record<string, unknown>,
  ) => Promise<{ docs: AIDocument[] }>;
  update: (args: Record<string, unknown>) => Promise<AIDocument>;
};
