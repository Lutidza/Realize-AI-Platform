/**
 * @file src/collections/Pages/pageKnowledge.adapter.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Подключает проекции зарегистрированной схемы и структуры Pages к переносимому plugin.
 */
import { pageKnowledgeDefinitions } from "./pageKnowledgeDefinitions.mapper";
import { pageKnowledgeOutline } from "./pageKnowledgeOutline.mapper";

/** Адаптер не читает хранилище и не выполняет записи: ACL и ревизия принадлежат plugin. */
export const pageKnowledgeAdapter = {
  version: "1.0" as const,
  definitions: pageKnowledgeDefinitions,
  outline: pageKnowledgeOutline,
};
