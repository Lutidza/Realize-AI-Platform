/**
 * @file packages/payload-ai-plugin/src/endpoints/catalogCategoryAssignment.ts
 * @version 2026-08-28
 * @description Dry-runs, applies and verifies one access-controlled category assignment.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type {
  AssignProductCategoryIntent,
  CategoryAssignmentPreviewDTO,
  DataDocumentRefDTO,
  DataEntitySelector,
} from "@realize/ai-contracts";
import type { Payload, PayloadRequest } from "payload";

import { EndpointError } from "./http";
import { relationID } from "./mappers";
import type { AIDocument } from "./repository";

type FindResult = { docs: AIDocument[]; totalDocs: number };
type BulkUpdateResult = { docs: AIDocument[]; errors?: unknown[] };
type UntypedLocalAPI = {
  find: (args: Record<string, unknown>) => Promise<FindResult>;
  update: (
    args: Record<string, unknown>,
  ) => Promise<AIDocument | BulkUpdateResult>;
};

export type ResolvedCategoryAssignment = {
  afterCategoryIDs: string[];
  beforeCategoryIDs: string[];
  expectedTargetUpdatedAt: string;
  preview: CategoryAssignmentPreviewDTO;
};

const selectorWhere = (
  selector: DataEntitySelector,
): Record<string, unknown> => {
  if ("id" in selector) return { id: { equals: selector.id } };
  if ("slug" in selector) return { slug: { equals: selector.slug } };
  return { title: { equals: selector.title } };
};

const documentRef = (document: AIDocument): DataDocumentRefDTO => {
  if (typeof document.title !== "string" || !document.title.trim()) {
    throw new EndpointError(
      "CONFLICT",
      "Resolved catalog document has no display title.",
      409,
    );
  }
  return {
    id: String(document.id),
    ...(typeof document.slug === "string" ? { slug: document.slug } : {}),
    title: document.title,
  };
};

const equalIDs = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

/** Executes the only allowlisted Payload mutation with caller access enabled. */
export class CatalogCategoryAssignment {
  private readonly api: UntypedLocalAPI;
  private readonly defaultIDType: "number" | "text";

  constructor(
    payload: Payload,
    private readonly req: PayloadRequest,
  ) {
    this.api = payload as unknown as UntypedLocalAPI;
    this.defaultIDType = payload.db.defaultIDType;
  }

  async dryRun(
    intent: AssignProductCategoryIntent,
  ): Promise<ResolvedCategoryAssignment> {
    const product = await this.resolveUnique("products", intent.product);
    const category = await this.resolveUnique("categories", intent.category);
    const beforeCategoryIDs = this.categoryIDs(product);
    if (beforeCategoryIDs.includes(String(category.id))) {
      throw new EndpointError(
        "CONFLICT",
        "Эта категория уже назначена выбранному товару.",
        409,
      );
    }
    const expectedTargetUpdatedAt = String(product.updatedAt || "");
    if (
      !expectedTargetUpdatedAt ||
      Number.isNaN(Date.parse(expectedTargetUpdatedAt))
    ) {
      throw new EndpointError(
        "CONFLICT",
        "Товар не содержит корректную optimistic-lock версию.",
        409,
      );
    }
    const beforeCategories = await this.categoryRefs(beforeCategoryIDs);
    const categoryRef = documentRef(category);
    const afterCategoryIDs = [...beforeCategoryIDs, categoryRef.id];

    return {
      afterCategoryIDs,
      beforeCategoryIDs,
      expectedTargetUpdatedAt,
      preview: {
        addedCategories: [categoryRef],
        afterCategories: [...beforeCategories, categoryRef],
        beforeCategories,
        category: categoryRef,
        product: documentRef(product),
      },
    };
  }

  async apply(input: {
    afterCategoryIDs: string[];
    beforeCategoryIDs: string[];
    expectedTargetUpdatedAt: string;
    productID: string;
  }): Promise<string> {
    return await this.updateAndVerify({
      expectedCategoryIDs: input.beforeCategoryIDs,
      expectedTargetUpdatedAt: input.expectedTargetUpdatedAt,
      nextCategoryIDs: input.afterCategoryIDs,
      productID: input.productID,
    });
  }

  async rollback(input: {
    afterCategoryIDs: string[];
    appliedTargetUpdatedAt: string;
    beforeCategoryIDs: string[];
    productID: string;
  }): Promise<string> {
    return await this.updateAndVerify({
      expectedCategoryIDs: input.afterCategoryIDs,
      expectedTargetUpdatedAt: input.appliedTargetUpdatedAt,
      nextCategoryIDs: input.beforeCategoryIDs,
      productID: input.productID,
    });
  }

  private async categoryRefs(ids: string[]): Promise<DataDocumentRefDTO[]> {
    if (ids.length === 0) return [];
    if (ids.length > 100) {
      throw new EndpointError(
        "CONFLICT",
        "Товар превышает лимит категорий первого Data Lane.",
        409,
      );
    }
    const result = await this.findAccessible(
      "categories",
      { id: { in: ids.map((id) => this.documentID(id)) } },
      ids.length,
    );
    const byID = new Map(result.docs.map((doc) => [String(doc.id), doc]));
    return ids.map((id) => {
      const document = byID.get(id);
      if (!document) {
        throw new EndpointError(
          "CONFLICT",
          `Категория ${id} недоступна или была удалена.`,
          409,
        );
      }
      return documentRef(document);
    });
  }

  private categoryIDs(product: AIDocument): string[] {
    if (!Array.isArray(product.categories)) return [];
    return product.categories.map(relationID).filter(Boolean);
  }

  private documentID(value: number | string): number | string {
    if (this.defaultIDType === "text") return String(value);
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(numeric) || numeric < 1) {
      throw new EndpointError(
        "INVALID_REQUEST",
        "Document ID is invalid.",
        400,
      );
    }
    return numeric;
  }

  private async findAccessible(
    collection: "categories" | "products",
    where: Record<string, unknown>,
    limit: number,
  ): Promise<FindResult> {
    return await this.api.find({
      collection,
      depth: 0,
      limit,
      overrideAccess: false,
      pagination: false,
      req: this.req,
      where,
    });
  }

  private async resolveUnique(
    collection: "categories" | "products",
    selector: DataEntitySelector,
  ): Promise<AIDocument> {
    const result = await this.findAccessible(
      collection,
      selectorWhere(selector),
      2,
    );
    if (result.docs.length !== 1) {
      throw new EndpointError(
        result.docs.length === 0 ? "NOT_FOUND" : "CONFLICT",
        result.docs.length === 0
          ? `${collection === "products" ? "Товар" : "Категория"} не найден.`
          : "Selector должен однозначно определять один документ.",
        result.docs.length === 0 ? 404 : 409,
      );
    }
    return result.docs[0];
  }

  private async updateAndVerify(input: {
    expectedCategoryIDs: string[];
    expectedTargetUpdatedAt: string;
    nextCategoryIDs: string[];
    productID: string;
  }): Promise<string> {
    const current = await this.resolveUnique("products", {
      id: input.productID,
    });
    if (
      current.updatedAt !== input.expectedTargetUpdatedAt ||
      !equalIDs(this.categoryIDs(current), input.expectedCategoryIDs)
    ) {
      throw new EndpointError(
        "CONFLICT",
        "Товар изменился после dry-run. Подготовьте новую операцию.",
        409,
      );
    }

    const result = await this.api.update({
      collection: "products",
      data: {
        categories: input.nextCategoryIDs.map((id) => this.documentID(id)),
      },
      limit: 1,
      overrideAccess: false,
      req: this.req,
      where: {
        and: [
          { id: { equals: this.documentID(input.productID) } },
          { updatedAt: { equals: input.expectedTargetUpdatedAt } },
        ],
      },
    });
    const bulk = Array.isArray((result as BulkUpdateResult).docs)
      ? (result as BulkUpdateResult)
      : undefined;
    const docs = bulk ? bulk.docs : [result as AIDocument];
    if (bulk?.errors?.length) {
      throw new EndpointError(
        "CONFLICT",
        "Payload отклонил изменение товара.",
        409,
      );
    }
    if (docs.length !== 1) {
      throw new EndpointError(
        "CONFLICT",
        "Товар изменился одновременно с применением операции.",
        409,
      );
    }

    const verified = await this.resolveUnique("products", {
      id: input.productID,
    });
    const updatedAt = String(verified.updatedAt || "");
    if (
      !updatedAt ||
      !equalIDs(this.categoryIDs(verified), input.nextCategoryIDs)
    ) {
      throw new EndpointError(
        "CONFLICT",
        "Payload verification не подтвердил ожидаемое состояние товара.",
        409,
      );
    }
    return updatedAt;
  }
}
