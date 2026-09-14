/**
 * @file packages/payload-ai-plugin/src/endpoints/pagePublicationWriteData.mapper.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Готовит внутреннюю полную запись Pages и сравнивает содержание после штатных Payload hooks.
 */
import { hashCanonicalJSON } from "@realize/change-engine";
import type { AIDocument } from "./repository";
import { EndpointError } from "./http";

/** Системные идентификаторы и даты контролирует Payload; отсутствующие optional поля очищаются явно. */
export const pagePublicationWriteData = (
  target: AIDocument,
  current: AIDocument,
  status: "draft" | "published",
): Record<string, unknown> => ({
  ...Object.fromEntries(
    [...new Set([...Object.keys(current), ...Object.keys(target)])]
      .filter(
        (key) => !["id", "createdAt", "updatedAt", "_status"].includes(key),
      )
      .map((key) => [key, structuredClone(target[key] ?? null)]),
  ),
  _status: status,
});

const contentHash = (page: AIDocument) =>
  hashCanonicalJSON(
    Object.fromEntries(
      Object.entries(page).filter(
        ([key]) => !["updatedAt", "_status", "publishedOn"].includes(key),
      ),
    ),
  );

/** Разрешена только собственная дата первой публикации; изменение текста/структуры hook-ом откатывает транзакцию. */
export const assertPagePublicationContent = (
  actual: AIDocument,
  expected: AIDocument,
  status: "draft" | "published",
) => {
  const publicationDateMatches =
    expected.publishedOn == null
      ? status === "published"
        ? typeof actual.publishedOn === "string" &&
          Number.isFinite(Date.parse(actual.publishedOn))
        : actual.publishedOn == null
      : actual.publishedOn === expected.publishedOn;
  if (
    actual._status !== status ||
    contentHash(actual) !== contentHash(expected) ||
    !publicationDateMatches
  )
    throw new EndpointError(
      "CONFLICT",
      "Payload изменил выбранное содержимое страницы. Публикация отменена; проверьте актуальную версию.",
      409,
    );
};
