// @vitest-environment node
/**
 * @file tests/int/pagePublicationContracts.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-14
 * @description Проверяет закрытый ввод публикации, явное свидетельство и отсутствие raw данных в DTO.
 */
import { describe, expect, it } from "vitest";
import {
  parseDataOperationIntent,
  parseDecideDataOperationInput,
  parsePagePublicationEvidence,
  parsePagePublicationPreview,
  parsePagePublicationReview,
  parseApplyDataOperationInput,
} from "@realize/ai-contracts";

const hash = "a".repeat(64);
const review = {
  manifestHash: hash,
  desktop: true,
  mobile: true,
  noErrors: true,
};
const page = { id: "7", title: "Доставка", slug: "delivery" };
const preview = {
  page,
  sourceOperationID: "2",
  manifestHash: hash,
  policyHash: hash,
  checks: [
    { id: "static", status: "passed", severity: "info", message: "Проверено." },
  ],
  before: { page, status: "unpublished" },
  after: { page, status: "published" },
};

describe("Публичные контракты публикации", () => {
  it("принимает только CAS; не принимает старый допуск или page body", () => {
    const input = {
      expectedVersion: 3,
      expectedOperationHash: hash,
    };
    expect(parseApplyDataOperationInput(input)).toEqual(input);
    expect(() =>
      parseApplyDataOperationInput({ ...input, page: { title: "Другой" } }),
    ).toThrow();
    expect(() =>
      parseApplyDataOperationInput({ ...input, previewToken: "bad" }),
    ).toThrow();
  });
  it.each(["desktop", "mobile", "noErrors"])(
    "требует явное подтверждение %s",
    (key) => {
      expect(() =>
        parsePagePublicationReview({ ...review, [key]: false }),
      ).toThrow();
      expect(() =>
        parsePagePublicationReview({ ...review, [key]: "true" }),
      ).toThrow();
    },
  );
  it("сохраняет manifest свидетельства и проверяет серверную дату", () => {
    expect(
      parseDecideDataOperationInput({
        expectedVersion: 1,
        expectedOperationHash: hash,
        previewReview: review,
      }).previewReview,
    ).toEqual(review);
    expect(
      parsePagePublicationEvidence({
        ...review,
        version: "1.0",
        reviewedAt: "2026-09-14T00:00:00.000Z",
      }).manifestHash,
    ).toBe(hash);
    expect(() =>
      parsePagePublicationEvidence({
        ...review,
        version: "1.0",
        reviewedAt: "tomorrow",
      }),
    ).toThrow();
    expect(() =>
      parsePagePublicationReview({ ...review, actorID: "admin" }),
    ).toThrow();
  });
  it("выдаёт только ограниченный preview одной страницы", () => {
    expect(parsePagePublicationPreview(preview)).toEqual(preview);
    expect(() =>
      parsePagePublicationPreview({
        ...preview,
        beforeSnapshot: { secret: "fixture" },
      }),
    ).toThrow();
    expect(() =>
      parsePagePublicationPreview({
        ...preview,
        before: { page: { ...page, id: "8" }, status: "published" },
      }),
    ).toThrow();
    expect(() =>
      parsePagePublicationPreview({
        ...preview,
        checks: Array.from({ length: 101 }, () => preview.checks[0]),
      }),
    ).toThrow();
  });
  it.each(["pages.publishDraft.v1", "pages.restorePublication.v1"])(
    "не предоставляет модели write intent %s",
    (kind) => {
      expect(() =>
        parseDataOperationIntent({
          kind,
          version: "1.0",
          sourceOperationID: "2",
        }),
      ).toThrow();
    },
  );
});
