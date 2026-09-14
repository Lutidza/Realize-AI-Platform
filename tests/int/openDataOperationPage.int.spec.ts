// @vitest-environment node
/**
 * @file tests/int/openDataOperationPage.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Проверяет навигацию к native Payload preview через ownership, Pages ACL и безопасный redirect без новых токенов.
 */
import { Forbidden, type CollectionConfig, type PayloadRequest } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAIEndpoints } from "../../packages/payload-ai-plugin/src/endpoints";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";
import {
  CONVERSATIONS_SLUG,
  DATA_OPERATIONS_SLUG,
  DEFAULT_API_ROUTE,
} from "../../packages/payload-ai-plugin/src/constants";
import { pagePublicationOperationHash } from "../../packages/payload-ai-plugin/src/endpoints/pagePublicationSnapshot.mapper";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import type { PagePublicationSnapshot } from "../../packages/payload-ai-plugin/src/endpoints/PagePublication.types";

afterEach(() => vi.restoreAllMocks());
const nativeURL =
  "/next/preview?path=%2Fdelivery&previewSecret=synthetic-native-secret";

const fixture = () => {
  const canUseChat = vi.fn(() => true);
  const denied = vi.fn(() => false);
  const options = sanitizeOptions({
    enabled: false,
    runtime: {
      mode: "local-development",
      controlPlaneTokenEnv: "SYNTHETIC_TEST_CONTROL_TOKEN",
    },
    access: {
      canUseChat,
      canManageData: denied,
      canManageAIConfiguration: denied,
      canManageIntegrations: denied,
      canApproveRelease: denied,
      canViewRuns: denied,
    },
  });
  const operation: AIDocument = {
    id: 2,
    kind: "pages.createDraft.v1",
    state: "applied",
    conversation: 10,
    appliedSnapshot: { pageID: "7", slug: "obsolete-slug" },
  };
  const page: AIDocument = {
    id: 7,
    title: "Доставка",
    slug: "delivery",
    _status: "draft",
  };
  const preview = vi.fn<
    NonNullable<NonNullable<CollectionConfig["admin"]>["preview"]>
  >(async () => nativeURL);
  const admin: NonNullable<CollectionConfig["admin"]> = { preview };
  let pageVisible = true;
  let pageFailure: unknown;
  const payload = {
    db: { defaultIDType: "number" },
    config: {
      localization: false,
      routes: { api: "/custom-api", admin: "/cms" },
    },
    collections: { pages: { config: { admin } } },
    logger: { error: vi.fn() },
    find: vi.fn(async (args: Record<string, unknown>) => {
      if (args.collection === DATA_OPERATIONS_SLUG)
        return { docs: [structuredClone(operation)], totalDocs: 1 };
      if (args.collection === CONVERSATIONS_SLUG) {
        const owner = (
          args.where as { and: { createdBy?: { equals: number } }[] }
        ).and.find((part) => part.createdBy)?.createdBy?.equals;
        return {
          docs: owner === 1 ? [{ id: 10, createdBy: 1 }] : [],
          totalDocs: owner === 1 ? 1 : 0,
        };
      }
      if (args.collection === "pages") {
        if (pageFailure) throw pageFailure;
        return {
          docs: pageVisible ? [structuredClone(page)] : [],
          totalDocs: pageVisible ? 1 : 0,
        };
      }
      // Runtime projection sees the disconnected integration and keeps AI disabled.
      return { docs: [], totalDocs: 0 };
    }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const req = {
    user: { id: 1, collection: "users", roles: ["admin"] },
    headers: new Headers(),
    routeParams: { id: "2" },
    payload,
    query: { pageID: "999", url: "https://untrusted.invalid" },
    locale: "ru",
    context: {},
  } as unknown as PayloadRequest;
  const endpoint = createAIEndpoints(options).find(
    (entry) =>
      entry.method === "get" &&
      entry.path === `${DEFAULT_API_ROUTE}/data-operations/:id/open-page`,
  );
  if (!endpoint)
    throw new Error("Native page navigation endpoint is not registered");
  return {
    req,
    page,
    operation,
    payload,
    admin,
    preview,
    canUseChat,
    setPageVisible: (value: boolean) => {
      pageVisible = value;
    },
    setPageFailure: (value: unknown) => {
      pageFailure = value;
    },
    call: () => endpoint.handler(req),
  };
};

describe("Переход операции к штатному предпросмотру Pages", () => {
  it("при AI off вызывает настроенный callback текущего документа и перенаправляет без JSON/записи", async () => {
    const f = fixture();
    const response = await f.call();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(nativeURL);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).toBe("");
    expect(f.preview).toHaveBeenCalledWith(f.page, {
      req: f.req,
      locale: "ru",
      token: null,
    });
    expect(f.payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "pages",
        draft: true,
        depth: 0,
        overrideAccess: false,
        req: f.req,
        where: { id: { equals: "7" } },
      }),
    );
    expect(f.payload.create).not.toHaveBeenCalled();
    expect(f.payload.update).not.toHaveBeenCalled();
    expect(f.payload.delete).not.toHaveBeenCalled();
    expect(f.payload.logger.error).not.toHaveBeenCalled();
  });

  it.each(["applied", "rollback_approved", "rollback_failed"])(
    "открывает сохранённую draft страницу при состоянии %s",
    async (state) => {
      const f = fixture();
      f.operation.kind = "pages.updateStructureDraft.v1";
      f.operation.state = state;
      expect((await f.call()).status).toBe(302);
    },
  );

  it.each(["publish", "restore"] as const)(
    "берёт страницу из проверенного publication snapshot: %s",
    async (mode) => {
      const f = fixture();
      const ref = { id: "7", title: "Доставка", slug: "delivery" };
      const snapshot: PagePublicationSnapshot = {
        version: "1.0",
        mode,
        source: { id: "1", version: 3, operationHash: "a".repeat(64) },
        revision: {
          page: f.page,
          baseFingerprint: "b".repeat(64),
          publicationFingerprint: "c".repeat(64),
          latestVersion: { id: "8", updatedAt: "2026-09-14T00:00:00.000Z" },
        },
        beforePage: f.page,
        targetPage: f.page,
        preservedDraft: f.page,
        preview: {
          page: ref,
          sourceOperationID: "1",
          manifestHash: "d".repeat(64),
          policyHash: "e".repeat(64),
          checks: [
            {
              id: "static-content",
              status: "passed",
              severity: "info",
              message: "Проверено",
            },
          ],
          before: { page: ref, status: "unpublished" },
          after: { page: ref, status: "published" },
        },
      };
      f.operation.kind =
        mode === "publish"
          ? "pages.publishDraft.v1"
          : "pages.restorePublication.v1";
      f.operation.state = "awaiting_approval";
      f.operation.afterSnapshot = snapshot;
      f.operation.intent = {
        kind: f.operation.kind,
        version: "1.0",
        sourceOperationID: "1",
      };
      f.operation.operationHash = pagePublicationOperationHash(snapshot);
      delete f.operation.appliedSnapshot;
      expect((await f.call()).status).toBe(302);
      expect(f.preview).toHaveBeenCalledWith(f.page, expect.any(Object));
      f.operation.operationHash = "0".repeat(64);
      f.preview.mockClear();
      expect((await f.call()).status).toBe(409);
      expect(f.preview).not.toHaveBeenCalled();
    },
  );

  it.each([
    "anonymous",
    "chat-denied",
    "foreign-owner",
    "page-denied",
    "missing-page",
  ])("закрывает недоступную страницу: %s", async (reason) => {
    const f = fixture();
    if (reason === "anonymous") f.req.user = null;
    if (reason === "chat-denied") f.canUseChat.mockReturnValue(false);
    if (reason === "foreign-owner") f.req.user = { ...f.req.user!, id: 99 };
    if (reason === "page-denied") f.setPageFailure(new Forbidden());
    if (reason === "missing-page") f.setPageVisible(false);
    const response = await f.call();
    expect(response.status).toBe(
      reason === "anonymous"
        ? 401
        : ["chat-denied", "page-denied"].includes(reason)
          ? 403
          : 404,
    );
    expect(response.headers.has("location")).toBe(false);
    expect(f.preview).not.toHaveBeenCalled();
    if (["anonymous", "chat-denied", "foreign-owner"].includes(reason))
      expect(
        f.payload.find.mock.calls.some(([args]) => args.collection === "pages"),
      ).toBe(false);
  });

  it.each([
    "catalog",
    "unapplied",
    "rolled-back",
    "missing-result",
    "missing-config",
  ])(
    "не создаёт новый способ preview для неподдержанного источника: %s",
    async (reason) => {
      const f = fixture();
      if (reason === "catalog") f.operation.kind = "catalog.assignCategory.v1";
      if (reason === "unapplied") f.operation.state = "awaiting_approval";
      if (reason === "rolled-back") f.operation.state = "rolled_back";
      if (reason === "missing-result") delete f.operation.appliedSnapshot;
      if (reason === "missing-config") delete f.admin.preview;
      expect((await f.call()).status).toBe(409);
      expect(f.preview).not.toHaveBeenCalled();
      expect(
        f.payload.find.mock.calls.some(([args]) => args.collection === "pages"),
      ).toBe(false);
    },
  );

  it.each([
    null,
    "https://outside.invalid/page",
    "//outside.invalid",
    "/\\outside.invalid",
    "/next/../admin",
    "/%2e%2e/admin",
    "/%2Foutside.invalid",
    "/next/preview\r\nLocation:bad",
  ])("отклоняет небезопасный или отсутствующий callback URL", async (url) => {
    const f = fixture();
    f.preview.mockResolvedValue(url);
    const response = await f.call();
    expect(response.status).toBe(409);
    expect(response.headers.has("location")).toBe(false);
    expect(await response.text()).not.toContain("outside.invalid");
    expect(f.payload.logger.error).not.toHaveBeenCalled();
  });

  it("не раскрывает callback exception с секретом в ответе или logger", async () => {
    const f = fixture();
    f.preview.mockRejectedValue(new Error(nativeURL));
    const response = await f.call();
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("synthetic-native-secret");
    expect(f.payload.logger.error).not.toHaveBeenCalled();
  });
});
