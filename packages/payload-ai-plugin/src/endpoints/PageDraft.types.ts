/**
 * @file packages/payload-ai-plugin/src/endpoints/PageDraft.types.ts
 * @version 2.0.0
 * @date 2026-09-14
 * @description Задаёт server-only адаптер host-схемы и immutable снимки черновика.
 */
import type { PageDraftStructureAdapter } from "./PageDraftStructure.types";
import type { PagePublicationAdapter } from "./PagePublication.types";
import type { AIDocument } from "./repository";
import type { PageKnowledgeAdapter } from "./PageKnowledge.types";
import type {
  CreatePageDraftIntent,
  PageDraftCreationPreviewDTO,
  PageDraftTextChange,
  PageDraftTextFieldDTO,
} from "@realize/ai-contracts";

/** Host строит только содержимое; статус, идентификатор и slug принадлежат исполнителю. */
export type PageDraftAdapter = {
  version: string;
  /** Публикация требует собственной host policy и post-commit обновления витрины. */
  publication?: PagePublicationAdapter;
  /** Описания и чтение структуры не расширяют полномочия текстового адаптера. */
  knowledge?: PageKnowledgeAdapter;
  /** Структурные изменения подключаются отдельно от текстовых листьев. */
  structure?: PageDraftStructureAdapter;
  mapContent: (intent: CreatePageDraftIntent) => {
    hero: Record<string, unknown>;
    layout: Record<string, unknown>[];
    meta?: { title?: string; description?: string };
  };
  /** Host разрешает только известные текстовые поля и сохраняет остальные данные документа. */
  text?: {
    version: string;
    readFields: (page: Record<string, unknown>) => PageDraftTextFieldDTO[];
    patch: (
      page: Record<string, unknown>,
      changes: PageDraftTextChange[],
    ) => Record<string, unknown>;
  };
};

export type PageDraftSnapshot = {
  createData: Record<string, unknown>;
  mapperVersion: string;
  preview: PageDraftCreationPreviewDTO;
};

export type AppliedPageDraftSnapshot = {
  pageID: string;
  title: string;
  slug: string;
  adminUrl: string;
  updatedAt: string;
  fingerprint: string;
};

export type PageLocalAPI = {
  create: (args: Record<string, unknown>) => Promise<AIDocument>;
  delete: (args: Record<string, unknown>) => Promise<AIDocument>;
  find: (args: Record<string, unknown>) => Promise<{ docs: AIDocument[] }>;
  findVersions: (
    args: Record<string, unknown>,
  ) => Promise<{ docs: AIDocument[] }>;
};
