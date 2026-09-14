/**
 * @file packages/payload-ai-plugin/src/endpoints/pageKnowledge.service.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Собирает проверенный каталог и разрешённую порцию структуры из host-проекции страницы.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import {
  parsePageArtifactCatalog,
  parsePageKnowledge,
  type PageArtifactCatalogDTO,
  type PageKnowledgeDTO,
} from "@realize/ai-contracts";
import {
  hashCanonicalJSON,
  SYSTEM_CAPABILITY_REGISTRY,
} from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../constants";
import type { RealizeAIServerRuntime } from "../types";
import { EndpointError } from "./http";
import type { PageKnowledgeAdapter } from "./PageKnowledge.types";
import { canReadPageFormReference } from "./pageKnowledgeReferences.repository";
import type { AIDocument } from "./repository";

/** Допуск проверяют endpoints и PageDraftUpdate; справочные описания не создают capability grants. */
export class PageKnowledge {
  constructor(private readonly req: PayloadRequest) {}

  private adapter(): PageKnowledgeAdapter {
    const runtime = this.req.payload.config.custom?.[
      REALIZE_AI_SERVER_RUNTIME_KEY
    ] as RealizeAIServerRuntime | undefined;
    const adapter = runtime?.pageDraft?.knowledge;
    if (
      adapter?.version !== "1.0" ||
      runtime?.pageDraft?.text?.version !== "1.0" ||
      runtime.pageDraft.version !== "1.0" ||
      typeof runtime.pageDraft.mapContent !== "function" ||
      typeof adapter.definitions !== "function" ||
      typeof adapter.outline !== "function"
    )
      throw new EndpointError(
        "CONFLICT",
        "Каталог структуры страниц не подключён к этому проекту.",
        409,
      );
    return adapter;
  }

  catalog(): PageArtifactCatalogDTO {
    const adapter = this.adapter();
    let definitions;
    try {
      definitions = adapter.definitions(
        this.req.payload.collections.pages.config.fields,
      );
    } catch {
      throw new EndpointError(
        "CONFLICT",
        "Зарегистрированная схема страницы несовместима с её описанием.",
        409,
      );
    }
    const catalog = parsePageArtifactCatalog({
      version: "1.0",
      hash: hashCanonicalJSON(definitions),
      definitions,
    });
    for (const definition of catalog.definitions) {
      for (const operation of definition.supportedOperations) {
        if (!SYSTEM_CAPABILITY_REGISTRY.get(operation))
          throw new EndpointError(
            "CONFLICT",
            "Каталог ссылается на незарегистрированную операцию.",
            409,
          );
      }
    }
    return catalog;
  }

  /** Читает ровно одну порцию; ACL связанных форм проверяется заново в рамках текущего запроса. */
  async read(
    page: AIDocument,
    fingerprint: string,
    offset: number,
  ): Promise<PageKnowledgeDTO> {
    const catalog = this.catalog();
    const outline = this.adapter().outline(structuredClone(page), offset);
    const used = new Set([
      "pages",
      ...outline.blocks.map((block) => block.definitionID),
    ]);
    // Проверяем весь host DTO до запросов к relationships. Временный readable не выдаётся наружу.
    const candidate = parsePageKnowledge({
      version: "1.0",
      pageID: String(page.id),
      fingerprint,
      catalogHash: catalog.hash,
      definitions: catalog.definitions.filter((definition) =>
        used.has(definition.id),
      ),
      outline: {
        ...outline,
        blocks: outline.blocks.map((block) => ({
          ...block,
          references: block.references.map((reference) => ({
            ...reference,
            access: reference.id === null ? "unavailable" : "readable",
          })),
        })),
      },
    });
    const access = new Map<string, boolean>();
    for (const block of candidate.outline.blocks) {
      for (const reference of block.references) {
        const id = reference.id;
        if (id !== null && !access.has(id))
          access.set(id, await canReadPageFormReference(this.req, id));
        if (id === null || !access.get(id)) {
          reference.id = null;
          reference.access = "unavailable";
        }
      }
    }
    return parsePageKnowledge(candidate);
  }
}
