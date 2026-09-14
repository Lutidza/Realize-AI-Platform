/**
 * @file packages/payload-ai-plugin/src/endpoints/PageKnowledge.types.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Определяет host-проекцию схемы и размещений блоков без доступа к хранилищу.
 */
import type {
  PageArtifactDefinitionDTO,
  PageOutlineDTO,
} from "@realize/ai-contracts";
import type { Field } from "payload";

/** Поля поступают из зарегистрированной Pages schema; host возвращает только явный DTO. */
export type PageKnowledgeAdapter = {
  version: "1.0";
  definitions: (pageFields: Field[]) => PageArtifactDefinitionDTO[];
  outline: (page: Record<string, unknown>, offset: number) => PageOutlineDTO;
};

/** Продолжение outline требует ту же ревизию страницы и ту же проекцию каталога. */
export type PageStructureReadRequest = {
  offset?: number;
  fingerprint?: string;
  catalogHash?: string;
};
