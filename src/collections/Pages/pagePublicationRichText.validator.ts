/**
 * @file src/collections/Pages/pagePublicationRichText.validator.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Проверяет статические Lexical узлы публикации без преобразования данных или собственного renderer.
 */
import type { PagePublicationValidationContext } from "./pagePublicationValidation.types";
import { PAGE_PUBLICATION_POLICY as policy } from "./pagePublicationPolicy.constants";
import {
  pagePublicationChoice,
  pagePublicationIssue,
  pagePublicationKnown,
  pagePublicationList,
  pagePublicationRecord,
  pagePublicationText,
} from "./pagePublicationValidation.util";

/** Публикуется исходный документ; неизвестные узлы и скрытое поведение не пропускаются молча. */
export const validatePagePublicationRichText = (
  value: unknown,
  context: PagePublicationValidationContext,
  path: string,
): void => {
  if (value == null) return;
  const doc = pagePublicationKnown(value, ["root"], context, path);
  const root = pagePublicationRecord(doc.root, context, `${path}/root`);
  if (root.type !== "root")
    pagePublicationIssue(
      context,
      path,
      "У текста отсутствует корневой узел Lexical.",
    );
  const visit = (value: unknown, path: string, depth: number): void => {
    if (++context.nodes > policy.maxNodes || depth > policy.maxTextDepth)
      pagePublicationIssue(
        context,
        path,
        "Текстовая структура превышает допустимую границу публикации.",
      );
    const node = pagePublicationRecord(value, context, path);
    const type = pagePublicationChoice(
      node.type,
      policy.textNodeTypes,
      context,
      path,
    );
    if (node.version !== 1)
      pagePublicationIssue(
        context,
        path,
        "Версия текстового узла не поддержана.",
      );
    const container = [
      "root",
      "paragraph",
      "heading",
      "quote",
      "list",
      "listitem",
    ].includes(type);
    const fields =
      type === "text" || type === "tab"
        ? ["text", "detail", "format", "mode", "style"]
        : container
          ? [
              "children",
              "direction",
              "format",
              "indent",
              "textFormat",
              "textStyle",
              ...(type === "heading" ? ["tag"] : []),
              ...(type === "list" ? ["tag", "listType", "start"] : []),
              ...(type === "listitem" ? ["value", "checked"] : []),
            ]
          : [];
    pagePublicationKnown(node, ["type", "version", ...fields], context, path);
    if (
      (node.style != null && node.style !== "") ||
      (node.textStyle != null && node.textStyle !== "")
    )
      pagePublicationIssue(
        context,
        path,
        "Текст с произвольным CSS пока не поддержан проверкой публикации.",
      );
    if (type === "text" || type === "tab") {
      if (node.mode != null && node.mode !== "normal")
        pagePublicationIssue(
          context,
          path,
          "Специальный текстовый режим не поддержан.",
        );
      pagePublicationText(node.text, context, `${path}/text`, 16000);
      for (const key of ["detail", "format"])
        if (
          node[key] != null &&
          (typeof node[key] !== "number" ||
            !Number.isSafeInteger(node[key]) ||
            Number(node[key]) < 0)
        )
          pagePublicationIssue(
            context,
            path,
            "Форматирование текстового узла некорректно.",
          );
      return;
    }
    if (!container) return;
    if (type === "heading")
      pagePublicationChoice(
        node.tag,
        ["h1", "h2", "h3", "h4", "h5", "h6"],
        context,
        `${path}/tag`,
      );
    if (type === "list") {
      pagePublicationChoice(
        node.listType,
        ["bullet", "number", "check"],
        context,
        `${path}/listType`,
      );
      pagePublicationChoice(node.tag, ["ol", "ul"], context, `${path}/tag`);
      if (
        node.start !== undefined &&
        (!Number.isSafeInteger(node.start) || Number(node.start) < 0)
      )
        pagePublicationIssue(context, path, "Начало списка некорректно.");
    }
    if (type === "listitem") {
      if (
        node.value !== undefined &&
        (!Number.isSafeInteger(node.value) || Number(node.value) < 0)
      )
        pagePublicationIssue(context, path, "Номер пункта списка некорректен.");
      if (node.checked !== undefined && typeof node.checked !== "boolean")
        pagePublicationIssue(
          context,
          path,
          "Состояние пункта списка некорректно.",
        );
    }
    for (const key of [
      "direction",
      "format",
      "indent",
      "textFormat",
      "textStyle",
    ])
      if (node[key] != null && !["string", "number"].includes(typeof node[key]))
        pagePublicationIssue(
          context,
          path,
          "Настройки текстового узла некорректны.",
        );
    for (const [index, child] of pagePublicationList(
      node.children,
      context,
      `${path}/children`,
      2048,
    ).entries())
      visit(child, `${path}/children/${index}`, depth + 1);
  };
  visit(root, `${path}/root`, 0);
};
