/**
 * @file tests/int/support/aiConfigAPITestHarness.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Имитирует Payload Local API для black-box config endpoint tests.
 * @docref Realize — AI Platform v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type { APIResponse } from "@realize/ai-contracts";
import { realizeAIPlugin } from "@realize/payload-ai-control";
import type { Config, Endpoint, PayloadRequest } from "payload";
import { vi } from "vitest";
import { createAIConfigTransactionTestDouble } from "./aiConfigTransactionTestDouble";

type Document = Record<string, unknown> & {
  createdAt: string;
  id: number;
  updatedAt: string;
};

const uniqueFields: Record<string, readonly string[]> = {
  "realize-ai-active-config-pointers": ["pointerVersionKey"],
  "realize-ai-config-drafts": ["draftID"],
  "realize-ai-config-events": ["idempotencyKey"],
  "realize-ai-config-releases": ["releaseID", "releaseKey"],
};

const nullableFields: Record<string, readonly string[]> = {
  "realize-ai-config-drafts": ["baseReleaseID", "baseReleaseManifestHash"],
  "realize-ai-config-releases": ["systemMaximumRelease"],
};

const relationValue = (value: unknown): unknown => {
  if (value && typeof value === "object" && "id" in value) {
    return (value as { id: unknown }).id;
  }
  return value;
};

const matches = (document: Document, where: unknown): boolean => {
  if (!where || typeof where !== "object" || Array.isArray(where)) return true;
  const query = where as Record<string, unknown>;
  if (Array.isArray(query.and)) {
    return query.and.every((condition) => matches(document, condition));
  }
  return Object.entries(query).every(([field, condition]) => {
    if (!condition || typeof condition !== "object") return false;
    const operation = condition as Record<string, unknown>;
    if (Object.hasOwn(operation, "equals")) {
      return relationValue(document[field]) === operation.equals;
    }
    return false;
  });
};

const sorted = (documents: Document[], sort: unknown): Document[] => {
  if (typeof sort !== "string" || !sort) return documents;
  const descending = sort.startsWith("-");
  const field = descending ? sort.slice(1) : sort;
  return [...documents].sort((left, right) => {
    const leftValue = left[field];
    const rightValue = right[field];
    const comparison =
      typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue));
    return descending ? -comparison : comparison;
  });
};

/** Public endpoint harness with deterministic timestamps and unique constraints. */
export const createAIConfigAPITestHarness = async (
  options: { actorID?: number; canManage?: boolean } = {},
) => {
  const transactions = createAIConfigTransactionTestDouble<Document>();
  let failedWriteCollection: string | undefined;
  let sequence = 0;
  const timestamp = (): string =>
    new Date(Date.UTC(2026, 8, 1, 12, 0, sequence++)).toISOString();
  const records = async (
    slug: string,
    req?: PayloadRequest,
  ): Promise<Document[]> => {
    const collections = await transactions.storeFor(req);
    const current = collections.get(slug) || [];
    collections.set(slug, current);
    return current;
  };

  const payload = {
    create: async (args: Record<string, unknown>) => {
      const slug = String(args.collection);
      const data = structuredClone(args.data as Record<string, unknown>);
      for (const field of nullableFields[slug] || []) {
        if (data[field] === undefined) data[field] = null;
      }
      if (failedWriteCollection === slug) {
        failedWriteCollection = undefined;
        throw new Error("Injected configuration write failure");
      }
      const documents = await records(slug, args.req as PayloadRequest);
      for (const field of uniqueFields[slug] || []) {
        if (documents.some((document) => document[field] === data[field])) {
          throw new Error(`duplicate ${slug}.${field}`);
        }
      }
      const now = timestamp();
      const document: Document = {
        ...structuredClone(data),
        createdAt: now,
        id: documents.length + 1,
        updatedAt: now,
      };
      documents.push(document);
      return structuredClone(document);
    },
    db: transactions.db,
    find: async (args: Record<string, unknown>) => {
      const documents = (
        await records(String(args.collection), args.req as PayloadRequest)
      ).filter((document) => matches(document, args.where));
      const limit = Number(args.limit || documents.length);
      const docs = sorted(documents, args.sort).slice(0, limit);
      return { docs: structuredClone(docs), totalDocs: documents.length };
    },
    logger: { error: vi.fn() },
    update: async (args: Record<string, unknown>) => {
      const documents = await records(
        String(args.collection),
        args.req as PayloadRequest,
      );
      const data = args.data as Record<string, unknown>;
      const limit = Number(args.limit || documents.length);
      const matching = documents.filter((document) =>
        matches(document, args.where),
      );
      const docs = matching.slice(0, limit).map((document) => {
        Object.assign(document, structuredClone(data), {
          updatedAt: timestamp(),
        });
        return structuredClone(document);
      });
      return { docs, errors: [] };
    },
  };

  const transformed = await realizeAIPlugin({
    access: {
      canApproveRelease: () => true,
      canManageAIConfiguration: () => options.canManage ?? true,
      canManageData: () => true,
      canManageIntegrations: () => true,
      canUseChat: () => true,
      canViewRuns: () => true,
    },
    enabled: false,
    runtime: {
      controlPlaneTokenEnv: "REALIZE_AI_CONTROL_PLANE_TOKEN",
      controlPlaneURL: "http://127.0.0.1:43120",
      mode: "local-development",
    },
  })({ collections: [], endpoints: [] } as unknown as Config);

  const endpoint = (method: Endpoint["method"], path: string): Endpoint => {
    const value = transformed.endpoints?.find(
      (item) => item.method === method && item.path === path,
    );
    if (!value) throw new Error(`Missing endpoint: ${method} ${path}`);
    return value;
  };

  return {
    count: (slug: string): number =>
      transactions.committed().get(slug)?.length ?? 0,
    documents: (slug: string): Document[] =>
      structuredClone(transactions.committed().get(slug) ?? []),
    patchStored: (
      slug: string,
      index: number,
      patch: Record<string, unknown>,
    ): void => {
      const document = transactions.committed().get(slug)?.[index];
      if (!document) throw new Error("Missing configuration fixture");
      Object.assign(document, structuredClone(patch));
    },
    failNextWrite: (slug: string): void => {
      failedWriteCollection = slug;
    },
    lockQueries: transactions.lockQueries,
    invoke: async <T>(
      method: Endpoint["method"],
      path: string,
      input: {
        body?: unknown;
        idempotencyKey?: string;
        routeParams?: Record<string, string>;
        actorID?: number | null;
      } = {},
    ): Promise<{ body: APIResponse<T>; status: number }> => {
      const headers = new Headers();
      if (input.idempotencyKey) {
        headers.set("idempotency-key", input.idempotencyKey);
      }
      const req = {
        headers,
        json: async () => input.body,
        payload,
        routeParams: input.routeParams,
        user:
          input.actorID === null
            ? null
            : { id: input.actorID ?? options.actorID ?? 42 },
      } as unknown as PayloadRequest;
      const response = await endpoint(method, path).handler(req);
      return {
        body: (await response.json()) as APIResponse<T>,
        status: response.status,
      };
    },
    logger: payload.logger,
  };
};
