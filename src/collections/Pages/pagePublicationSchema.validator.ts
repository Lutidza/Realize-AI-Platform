/**
 * @file src/collections/Pages/pagePublicationSchema.validator.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Сверяет известные поля страницы с зарегистрированной схемой без запуска hooks и validators.
 */
import type { Field } from "payload";
import type { PagePublicationValidationContext } from "./pagePublicationValidation.types";
import { pagePublicationIssue } from "./pagePublicationValidation.util";

export const pagePublicationSchema = (
  context: PagePublicationValidationContext,
): void => {
  const indexed = new Map<string, Field>();
  let visited = 0;
  const visit = (fields: Field[], prefix: string, depth: number) => {
    if (depth > 16 || fields.length > 512)
      return pagePublicationIssue(
        context,
        prefix,
        "Схема страницы превышает границы проверки.",
      );
    for (const field of fields) {
      if (++visited > 1024)
        return pagePublicationIssue(
          context,
          prefix,
          "Схема страницы слишком велика.",
        );
      const path = "name" in field ? `${prefix}/${field.name}` : prefix;
      if ("name" in field) indexed.set(path, field);
      if (field.type === "tabs")
        field.tabs.forEach((tab) =>
          visit(
            tab.fields,
            "name" in tab ? `${path}/${tab.name}` : path,
            depth + 1,
          ),
        );
      else if (field.type === "blocks")
        field.blocks.forEach((block) => {
          if (typeof block !== "string")
            visit(block.fields, `${path}/${block.slug}`, depth + 1);
        });
      else if ("fields" in field)
        visit(
          field.fields,
          field.type === "array" ? `${path}/*` : path,
          depth + 1,
        );
    }
  };
  visit(context.req.payload.collections.pages.config.fields, "", 0);
  const expected: Record<string, string> = {
    "/title": "text",
    "/slug": "text",
    "/hero/type": "select",
    "/hero/richText": "richText",
    "/hero/media": "upload",
    "/layout": "blocks",
    "/layout/content/columns": "array",
    "/layout/content/columns/*/size": "select",
    "/layout/content/columns/*/richText": "richText",
    "/layout/content/columns/*/enableLink": "checkbox",
    "/layout/content/columns/*/link": "group",
    "/layout/cta/richText": "richText",
    "/layout/cta/links": "array",
    "/layout/banner/style": "select",
    "/layout/banner/content": "richText",
    "/layout/mediaBlock/media": "upload",
    "/layout/formBlock/form": "relationship",
  };
  for (const [path, type] of Object.entries(expected))
    if (indexed.get(path)?.type !== type)
      return pagePublicationIssue(
        context,
        path,
        "Зарегистрированная схема несовместима с проверкой публикации.",
      );
  for (const path of [
    "/hero/media",
    "/layout/mediaBlock/media",
    "/layout/formBlock/form",
  ]) {
    const field = indexed.get(path)!;
    if (
      !("relationTo" in field) ||
      field.relationTo !== (path.endsWith("/form") ? "forms" : "media")
    )
      return pagePublicationIssue(
        context,
        path,
        "Изменился тип зависимости компонента страницы.",
      );
  }
};
