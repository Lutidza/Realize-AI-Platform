/**
 * @file src/collections/Pages/pagePublicationPolicy.validator.ts
 * @version 1.0.1
 * @date 2026-09-14
 * @description Отклоняет неизвестные поля и изменяемые зависимости до любых чтений зависимостей.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type { PagePublicationCheckDTO } from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import type { PagePublicationValidationContext } from "./pagePublicationValidation.types";
import { PagePublicationValidationError } from "./pagePublicationValidation.error";
import {
  pagePublicationChoice,
  pagePublicationKnown,
  pagePublicationIssue,
  pagePublicationList,
  pagePublicationRecord,
  pagePublicationText,
} from "./pagePublicationValidation.util";
import { pagePublicationSchema } from "./pagePublicationSchema.validator";
import { validatePagePublicationRichText } from "./pagePublicationRichText.validator";
import { PAGE_PUBLICATION_POLICY as policy } from "./pagePublicationPolicy.constants";

/** Только shape/policy проверка. Ни Local API, ни произвольные hooks/validators здесь не вызываются. */
export const validatePagePublicationPolicy = (
  page: Record<string, unknown>,
  req: PayloadRequest,
): PagePublicationCheckDTO[] => {
  const context: PagePublicationValidationContext = {
    req,
    checks: [],
    nodes: 0,
  };
  const known = (value: unknown, keys: readonly string[], path: string) =>
    pagePublicationKnown(value, keys, context, path);
  const dependency = (path: string): never =>
    pagePublicationIssue(
      context,
      path,
      "Публикация изображений, форм, ссылок и встроенных элементов пока не поддержана. Доступен сценарий статической текстовой страницы.",
    );
  const richText = (value: unknown, path: string) =>
    validatePagePublicationRichText(value, context, path);
  const disabledLink = (value: unknown, path: string) => {
    if (value == null) return;
    const link = known(
      value,
      ["type", "newTab", "reference", "url", "label", "appearance"],
      path,
    );
    if (link.reference != null) {
      const reference = known(
        link.reference,
        ["relationTo", "value"],
        `${path}/reference`,
      );
      if (reference.value != null || reference.relationTo != null)
        dependency(`${path}/reference`);
    }
    if (link.url != null && link.url !== "") dependency(`${path}/url`);
  };
  try {
    pagePublicationSchema(context);
    known(
      page,
      [
        "id",
        "title",
        "slug",
        "hero",
        "layout",
        "meta",
        "publishedOn",
        "createdAt",
        "updatedAt",
        "_status",
      ],
      "/",
    );
    if (Buffer.byteLength(JSON.stringify(page), "utf8") > policy.maxBytes)
      pagePublicationIssue(
        context,
        "/",
        "Страница превышает допустимый размер публикации.",
      );
    pagePublicationText(page.title, context, "/title", 160, true);
    const slug = pagePublicationText(page.slug, context, "/slug", 160, true);
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      (policy.reservedSlugs as readonly string[]).includes(slug)
    )
      pagePublicationIssue(
        context,
        "/slug",
        "Адрес страницы некорректен или занят служебным разделом сайта.",
      );
    if (page.meta != null) {
      const meta = known(page.meta, ["title", "description", "image"], "/meta");
      if (meta.image != null) dependency("/meta/image");
      if (meta.title != null)
        pagePublicationText(meta.title, context, "/meta/title", 160);
      if (meta.description != null)
        pagePublicationText(
          meta.description,
          context,
          "/meta/description",
          320,
        );
    }
    const hero = known(
      page.hero,
      ["type", "richText", "links", "media"],
      "/hero",
    );
    if (
      !(policy.heroTypes as readonly unknown[]).includes(hero.type) ||
      hero.media != null ||
      (hero.links != null &&
        pagePublicationList(hero.links, context, "/hero/links", 2).length)
    )
      dependency("/hero");
    richText(hero.richText, "/hero/richText");
    const blocks = pagePublicationList(
      page.layout,
      context,
      "/layout",
      policy.maxBlocks,
    );
    if (!blocks.length)
      pagePublicationIssue(
        context,
        "/layout",
        "Для публикации нужен хотя бы один блок страницы.",
      );
    for (const [index, raw] of blocks.entries()) {
      const path = `/layout/${index}`;
      const block = pagePublicationRecord(raw, context, path);
      if (!(policy.blockTypes as readonly unknown[]).includes(block.blockType))
        dependency(path);
      known(
        block,
        [
          "blockType",
          "id",
          "blockName",
          ...(block.blockType === "content"
            ? ["columns"]
            : ["style", "content"]),
        ],
        path,
      );
      if (block.id != null)
        pagePublicationText(block.id, context, `${path}/id`, 128, true);
      if (block.blockName != null)
        pagePublicationText(block.blockName, context, `${path}/blockName`, 160);
      if (block.blockType === "banner") {
        pagePublicationChoice(
          block.style,
          ["info", "warning", "error", "success"],
          context,
          `${path}/style`,
        );
        if (block.content == null)
          pagePublicationIssue(
            context,
            `${path}/content`,
            "Обязательный текст баннера отсутствует.",
          );
        richText(block.content, `${path}/content`);
      } else
        for (const [index, rawColumn] of pagePublicationList(
          block.columns,
          context,
          `${path}/columns`,
          128,
        ).entries()) {
          const columnPath = `${path}/columns/${index}`;
          const column = known(
            rawColumn,
            ["id", "size", "enableLink", "richText", "link"],
            columnPath,
          );
          pagePublicationChoice(
            column.size,
            ["full", "half", "oneThird", "twoThirds"],
            context,
            `${columnPath}/size`,
          );
          if (
            column.enableLink != null &&
            typeof column.enableLink !== "boolean"
          )
            pagePublicationIssue(
              context,
              columnPath,
              "Признак ссылки колонки некорректен.",
            );
          if (column.enableLink === true) dependency(`${columnPath}/link`);
          disabledLink(column.link, `${columnPath}/link`);
          richText(column.richText, `${columnPath}/richText`);
        }
    }
  } catch (error) {
    if (!(error instanceof PagePublicationValidationError)) throw error;
  }
  return context.checks;
};
