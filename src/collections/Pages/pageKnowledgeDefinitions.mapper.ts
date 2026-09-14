/**
 * @file src/collections/Pages/pageKnowledgeDefinitions.mapper.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Выводит безопасные описания полей из реально зарегистрированной схемы Pages.
 */
import type { PageArtifactDefinitionDTO } from "@realize/ai-contracts";
import type { Field } from "payload";
import { contentAgentManifest } from "@/blocks/Content/contentAgent.manifest";
import { formAgentManifest } from "@/blocks/Form/formAgent.manifest";
import { pageAgentManifest } from "./pageAgent.manifest";

// Это требования совместимости адаптера; значения и свойства полей читаются из регистрации.
const PAGE_FIELDS = {
  "/title": "text",
  "/slug": "text",
  "/publishedOn": "date",
  "/hero/type": "select",
  "/hero/richText": "richText",
  "/hero/links": "array",
  "/hero/media": "upload",
  "/layout": "blocks",
  "/meta/title": "text",
  "/meta/description": "textarea",
  "/meta/image": "upload",
};
const CONTENT_FIELDS = {
  "/columns": "array",
  "/columns/*/size": "select",
  "/columns/*/richText": "richText",
  "/columns/*/enableLink": "checkbox",
  "/columns/*/link": "group",
};
const FORM_FIELDS = {
  "/form": "relationship",
  "/enableIntro": "checkbox",
  "/introContent": "richText",
};

const indexedFields = (fields: Field[]): Map<string, Field> => {
  const indexed = new Map<string, Field>();
  let visited = 0;
  const visit = (fields: Field[], prefix: string, depth: number) => {
    if (depth > 16 || fields.length > 512)
      throw new Error("Схема страницы превышает границы каталога.");
    for (const field of fields) {
      if (++visited > 512) throw new Error("Схема страницы слишком велика.");
      const path = "name" in field ? `${prefix}/${field.name}` : prefix;
      if ("name" in field) {
        if (indexed.has(path))
          throw new Error("Поля схемы страницы неоднозначны.");
        indexed.set(path, field);
      }
      if (field.type === "tabs") {
        for (const tab of field.tabs)
          visit(
            tab.fields,
            "name" in tab ? `${path}/${tab.name}` : path,
            depth + 1,
          );
      } else if ("fields" in field) {
        visit(
          field.fields,
          field.type === "array" ? `${path}/*` : path,
          depth + 1,
        );
      }
    }
  };
  visit(fields, "", 0);
  return indexed;
};

const summarize = (
  fields: Map<string, Field>,
  expected: Record<string, string>,
): PageArtifactDefinitionDTO["fields"] =>
  Object.entries(expected).map(([path, type]) => {
    const field = fields.get(path);
    if (!field || field.type !== type)
      throw new Error(`Схема ${path} несовместима с описанием страницы.`);
    return {
      path,
      type: field.type,
      required: "required" in field && field.required === true,
      ...("relationTo" in field
        ? {
            relationTo: Array.isArray(field.relationTo)
              ? [...field.relationTo]
              : [field.relationTo],
          }
        : {}),
    };
  });

/** Получает final registration, включая изменения host plugins; raw config не покидает host. */
export const pageKnowledgeDefinitions = (
  pageFields: Field[],
): PageArtifactDefinitionDTO[] => {
  const page = indexedFields(pageFields);
  const layout = page.get("/layout");
  if (layout?.type !== "blocks")
    throw new Error("В Pages отсутствует зарегистрированный layout.");
  const blockFields = (slug: string) => {
    const matches = layout.blocks.filter(
      (block) => typeof block !== "string" && block.slug === slug,
    );
    if (matches.length !== 1 || typeof matches[0] === "string")
      throw new Error(
        `Блок ${slug} не зарегистрирован однозначно в Pages.layout.`,
      );
    return indexedFields(matches[0].fields);
  };
  const form = blockFields("formBlock");
  const relation = form.get("/form");
  if (relation?.type !== "relationship" || relation.relationTo !== "forms")
    throw new Error("FormBlock должен ссылаться на коллекцию forms.");
  return [
    {
      ...structuredClone(pageAgentManifest),
      fields: summarize(page, PAGE_FIELDS),
    },
    {
      ...structuredClone(contentAgentManifest),
      fields: summarize(blockFields("content"), CONTENT_FIELDS),
    },
    {
      ...structuredClone(formAgentManifest),
      fields: summarize(form, FORM_FIELDS),
    },
  ];
};
