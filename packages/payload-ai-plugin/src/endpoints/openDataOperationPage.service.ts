/**
 * @file packages/payload-ai-plugin/src/endpoints/openDataOperationPage.service.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Разрешает переход владельца операции к штатному предпросмотру текущей Pages через collection.admin.preview.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/17-preview-strategy.md
 */
import { parseIdentifier } from "@realize/ai-contracts";
import { Forbidden, NotFound, type PayloadRequest } from "payload";
import { DataOperationRepository } from "./dataOperationRepository";
import { EndpointError } from "./http";
import { isPagePublicationKind } from "./pagePublicationAccess.service";
import { readPagePublicationSnapshot } from "./pagePublicationSnapshot.mapper";
import type { PageDraftUpdateLocalAPI } from "./PageDraftUpdate.types";
import type { AIDocument } from "./repository";

const unavailable = () =>
  new EndpointError(
    "CONFLICT",
    "Предпросмотр этой страницы недоступен. Откройте страницу в админке.",
    409,
  );

/** Адрес задаёт установленная коллекция, но внешние переходы и неоднозначные пути закрываются. */
const internalPreviewURL = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/u.test(value)
  )
    throw unavailable();
  try {
    const url = new URL(value, "https://preview.invalid");
    const path = value.split(/[?#]/, 1)[0];
    if (url.origin !== "https://preview.invalid" || url.hash)
      throw unavailable();
    for (const segment of path.split("/")) {
      const decoded = decodeURIComponent(segment);
      if (
        decoded === "." ||
        decoded === ".." ||
        /[\\/\u0000-\u001f\u007f]/u.test(decoded)
      )
        throw unavailable();
    }
    return value;
  } catch {
    throw unavailable();
  }
};

/** HTTP boundary проверяет canUseChat; сервис читает только страницу из принадлежащей текущему пользователю операции. */
export const openDataOperationPage = async (
  req: PayloadRequest,
  operationID: string,
): Promise<string> => {
  if (!req.user)
    throw new EndpointError("UNAUTHENTICATED", "Войдите в админку.", 401);
  const operation = await new DataOperationRepository(
    req.payload,
    req,
  ).getOwnedOperation(
    parseIdentifier(operationID, "data operation id"),
    req.user.id,
  );
  if (operation.state === "rolled_back") throw unavailable();
  let pageID: string;
  if (isPagePublicationKind(operation.kind))
    pageID = readPagePublicationSnapshot(operation).preview.page.id;
  else {
    const applied = operation.appliedSnapshot as AIDocument | undefined;
    if (
      ![
        "pages.createDraft.v1",
        "pages.updateDraft.v1",
        "pages.updateStructureDraft.v1",
      ].includes(String(operation.kind)) ||
      !["applied", "rollback_approved", "rollback_failed"].includes(
        String(operation.state),
      ) ||
      !applied ||
      typeof applied.pageID !== "string"
    )
      throw unavailable();
    pageID = parseIdentifier(applied.pageID, "page id");
  }
  const preview = req.payload.collections.pages?.config.admin.preview;
  if (typeof preview !== "function") throw unavailable();
  if (req.locale === "all")
    throw new EndpointError(
      "INVALID_REQUEST",
      "Для просмотра выберите один язык страницы.",
      400,
    );
  const api = req.payload as unknown as Pick<PageDraftUpdateLocalAPI, "find">;
  let page: AIDocument;
  try {
    const result = await api.find({
      collection: "pages",
      draft: true,
      depth: 0,
      overrideAccess: false,
      req,
      pagination: false,
      limit: 2,
      where: { id: { equals: pageID } },
    });
    if (result.docs.length !== 1 || String(result.docs[0].id) !== pageID)
      throw new NotFound();
    page = result.docs[0];
  } catch (error) {
    if (error instanceof Forbidden)
      throw new EndpointError(
        "FORBIDDEN",
        "Недостаточно прав для просмотра страницы.",
        403,
      );
    if (error instanceof NotFound)
      throw new EndpointError(
        "NOT_FOUND",
        "Страница удалена или недоступна.",
        404,
      );
    throw unavailable();
  }
  const localization = req.payload.config.localization;
  const locale =
    req.locale ?? (localization ? localization.defaultLocale : "en");
  let url: unknown;
  try {
    // Текущая сессия остаётся в req. Новый токен не выпускается; штатный Pages callback использует собственную настройку.
    url = await preview(page, { req, locale, token: null });
  } catch {
    // Исключение callback может содержать секрет ссылки; оно не попадает в общий logger/error envelope.
    throw unavailable();
  }
  return internalPreviewURL(url);
};
