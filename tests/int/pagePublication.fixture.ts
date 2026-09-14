/**
 * @file tests/int/pagePublication.fixture.ts
 * @version 1.2.0
 * @date 2026-09-14
 * @description Общие публичные synthetic DTO для адресных проверок интерфейса и повторов публикации.
 */
import type {
  PageDraftCreationOperationDTO,
  PagePublicationOperationDTO,
} from "@realize/ai-contracts";
export const draft: PageDraftCreationOperationDTO = {
  id: "41",
  conversationID: "7",
  sourceMessageID: "12",
  createdAt: "2026-09-14T10:00:00Z",
  updatedAt: "2026-09-14T10:00:00Z",
  expiresAt: "2099-09-14T10:00:00Z",
  operationHash: "a".repeat(64),
  rollbackHash: "b".repeat(64),
  estimatedCount: 1,
  riskLevel: "R1",
  version: 3,
  state: "applied",
  title: "Создать страницу доставки",
  kind: "pages.createDraft.v1",
  rollbackStrategy: "delete-created-draft",
  preview: {
    title: "Доставка",
    slug: "delivery",
    status: "draft",
    sections: [{ body: "Условия доставки" }],
  },
  result: {
    page: { id: "17", title: "Доставка", slug: "delivery" },
    adminUrl: "/admin/collections/pages/17",
    frontendPreviewUrl: "/api/realize-ai/data-operations/41/open-page",
  },
};
export const publication: PagePublicationOperationDTO = {
  ...draft,
  adminUrl: "/admin/collections/pages/17",
  frontendPreviewUrl: "/api/realize-ai/data-operations/51/open-page",
  id: "51",
  state: "awaiting_approval",
  version: 1,
  operationHash: "d".repeat(64),
  kind: "pages.publishDraft.v1",
  title: "Опубликовать страницу доставки",
  riskLevel: "R2",
  rollbackStrategy: "restore-publication",
  result: undefined,
  expectedTargetUpdatedAt: "2026-09-14T10:00:00Z",
  preview: {
    page: draft.result!.page,
    sourceOperationID: draft.id,
    manifestHash: "c".repeat(64),
    policyHash: "e".repeat(64),
    before: { status: "unpublished", page: draft.result!.page },
    after: { status: "published", page: draft.result!.page },
    checks: [
      {
        id: "publication",
        status: "passed",
        severity: "error",
        message: "Сохранённая версия допускает публикацию.",
      },
    ],
  },
};
