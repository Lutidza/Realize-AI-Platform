/**
 * @file packages/ai-contracts/src/parsePagePublication.validator.ts
 * @version 2.0.0
 * @date 2026-09-14
 * @description Проверяет точную публикацию, пользовательское свидетельство и ограниченную публичную проекцию.
 */
import { ContractValidationError, parseIdentifier } from "./validation";
import { pageDraftTextValidation as v } from "./pageDraftTextValidation.validator";
import type {
  PagePublicationCheckDTO,
  PagePublicationPreviewDTO,
  PagePublicationReviewInput,
  PagePublicationReviewEvidenceDTO,
  PagePublicationStateDTO,
} from "./PagePublication.types";

/** Ограничивает серверные проверки публикации; произвольные поля не выходят в карточку. */
export const parsePagePublicationChecks = (
  value: unknown,
): PagePublicationCheckDTO[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100)
    throw new ContractValidationError(
      "publication checks must contain 1 to 100 entries.",
    );
  return value.map((raw) => {
    const item = v.object(
      raw,
      ["id", "status", "severity", "target", "message"],
      "publication check",
    );
    if (
      (item.status !== "passed" &&
        item.status !== "failed" &&
        item.status !== "not_checked") ||
      (item.severity !== "error" &&
        item.severity !== "warning" &&
        item.severity !== "info")
    )
      throw new ContractValidationError(
        "publication check status or severity is invalid.",
      );
    const id = v.text(item.id, "check id", 100);
    if (!/^[a-zA-Z0-9._-]+$/.test(id))
      throw new ContractValidationError("publication check id is invalid.");
    return {
      id,
      status: item.status,
      severity: item.severity,
      message: v.text(item.message, "check message", 600),
      ...(item.target === undefined
        ? {}
        : { target: v.text(item.target, "check target", 300) }),
    };
  });
};

export const parsePagePublicationReview = (
  value: unknown,
): PagePublicationReviewInput => {
  const input = v.object(
    value,
    ["manifestHash", "desktop", "mobile", "noErrors"],
    "preview review",
  );
  if (
    input.desktop !== true ||
    input.mobile !== true ||
    input.noErrors !== true
  )
    throw new ContractValidationError(
      "Подтвердите просмотр этой версии на компьютере, телефоне и отсутствие ошибок отображения.",
    );
  return {
    manifestHash: v.hash(input.manifestHash),
    desktop: true,
    mobile: true,
    noErrors: true,
  };
};

export const parsePagePublicationEvidence = (
  value: unknown,
): PagePublicationReviewEvidenceDTO => {
  const input = v.object(
    value,
    ["version", "reviewedAt", "manifestHash", "desktop", "mobile", "noErrors"],
    "preview evidence",
  );
  if (input.version !== "1.0")
    throw new ContractValidationError(
      "Версия подтверждения просмотра не поддерживается.",
    );
  return {
    version: "1.0",
    reviewedAt: v.date(input.reviewedAt),
    ...parsePagePublicationReview({
      manifestHash: input.manifestHash,
      desktop: input.desktop,
      mobile: input.mobile,
      noErrors: input.noErrors,
    }),
  };
};

const page = (value: unknown) => {
  const input = v.object(value, ["id", "title", "slug"], "publication page");
  return {
    id: parseIdentifier(input.id, "page id"),
    title: v.text(input.title, "page title", 160),
    ...(input.slug === undefined
      ? {}
      : { slug: v.text(input.slug, "page slug", 160) }),
  };
};
const state = (value: unknown): PagePublicationStateDTO => {
  const input = v.object(value, ["status", "page"], "publication state");
  if (input.status !== "published" && input.status !== "unpublished")
    throw new ContractValidationError(
      "Состояние публикации не поддерживается.",
    );
  return { status: input.status, page: page(input.page) };
};

/** Публичный DTO не содержит полных снимков; максимальный размер 64 КиБ. */
export const parsePagePublicationPreview = (
  value: unknown,
): PagePublicationPreviewDTO => {
  const input = v.object(
    value,
    [
      "page",
      "sourceOperationID",
      "manifestHash",
      "policyHash",
      "checks",
      "before",
      "after",
    ],
    "publication preview",
  );
  const result: PagePublicationPreviewDTO = {
    page: page(input.page),
    sourceOperationID: parseIdentifier(
      input.sourceOperationID,
      "source operation id",
    ),
    manifestHash: v.hash(input.manifestHash),
    policyHash: v.hash(input.policyHash),
    checks: parsePagePublicationChecks(input.checks),
    before: state(input.before),
    after: state(input.after),
  };
  if (
    result.before.page.id !== result.page.id ||
    result.after.page.id !== result.page.id ||
    new TextEncoder().encode(JSON.stringify(result)).length > 64 * 1024
  )
    throw new ContractValidationError(
      "Публичный результат публикации не соответствует выбранной странице или превышает ограничение размера.",
    );
  return result;
};
