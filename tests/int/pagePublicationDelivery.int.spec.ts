// @vitest-environment node
/**
 * @file tests/int/pagePublicationDelivery.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-14
 * @description Проверяет durable outbox, post-commit delivery, ownership, безопасный DTO и гонку success/failure.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PayloadRequest } from "payload";
import {
  REALIZE_AI_SERVER_RUNTIME_KEY,
  DATA_OPERATION_EVENTS_SLUG,
} from "../../packages/payload-ai-plugin/src/constants";
import {
  createPagePublicationDelivery,
  deliverPagePublication,
  getPagePublicationDelivery,
} from "../../packages/payload-ai-plugin/src/endpoints/pagePublicationDelivery.service";
import { DataOperationRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationRepository";
import * as snapshots from "../../packages/payload-ai-plugin/src/endpoints/pagePublicationSnapshot.mapper";
import { withPayloadTransaction } from "../../packages/payload-ai-plugin/src/endpoints/payloadTransaction";
import { EndpointError } from "../../packages/payload-ai-plugin/src/endpoints/http";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import type { PagePublicationSnapshot } from "../../packages/payload-ai-plugin/src/endpoints/PagePublication.types";

afterEach(() => vi.restoreAllMocks());

const fixture = () => {
  const operation: AIDocument = {
    id: 2,
    kind: "pages.publishDraft.v1",
    state: "applied",
    version: 3,
    operationHash: "a".repeat(64),
    conversation: 10,
  };
  const targetPage: AIDocument = {
    id: 7,
    title: "Доставка",
    slug: "delivery",
    _status: "draft",
    updatedAt: "2026-09-14T00:00:00.000Z",
  };
  const targetRef = { id: "7", title: "Доставка", slug: "delivery" };
  const snapshot: PagePublicationSnapshot = {
    version: "1.0",
    mode: "publish",
    source: { id: "1", version: 3, operationHash: "c".repeat(64) },
    revision: {
      page: structuredClone(targetPage),
      baseFingerprint: "d".repeat(64),
      publicationFingerprint: "e".repeat(64),
      latestVersion: { id: "8", updatedAt: "2026-09-14T00:00:00.000Z" },
    },
    beforePage: { id: 7, title: "Главная", slug: "home", _status: "published" },
    targetPage,
    preservedDraft: structuredClone(targetPage),
    preview: {
      page: targetRef,
      sourceOperationID: "1",
      manifestHash: "a".repeat(64),
      policyHash: "b".repeat(64),
      checks: [],
      before: {
        status: "published",
        page: { id: "7", title: "Главная", slug: "home" },
      },
      after: { status: "published", page: targetRef },
    },
  };
  vi.spyOn(snapshots, "readPagePublicationSnapshot").mockImplementation(() =>
    structuredClone(snapshot),
  );
  const owned = vi
    .spyOn(DataOperationRepository.prototype, "getOwnedOperation")
    .mockImplementation(async (id, userID) => {
      if (id !== "2" || String(userID) !== "1")
        throw new EndpointError("NOT_FOUND", "Operation not found", 404);
      return structuredClone(operation);
    });
  let event: AIDocument | undefined;
  let nextTransaction = 1;
  let lockTail = Promise.resolve();
  const releases = new Map<number, () => void>();
  const transactionSnapshots = new Map<number, AIDocument | undefined>();
  const sessions: Record<
    string,
    { db: { execute: (query: string) => Promise<void> } }
  > = {};
  const execute = vi.fn();
  const db = {
    name: "postgres",
    defaultIDType: "number",
    sessions,
    beginTransaction: vi.fn(async () => {
      const id = nextTransaction++;
      transactionSnapshots.set(id, structuredClone(event));
      sessions[String(id)] = {
        db: {
          execute: async (query) => {
            execute(query);
            const before = lockTail;
            lockTail = new Promise<void>((resolve) => {
              releases.set(id, resolve);
            });
            await before;
            transactionSnapshots.set(id, structuredClone(event));
          },
        },
      };
      return id;
    }),
    commitTransaction: vi.fn(async (id: number) => {
      releases.get(id)?.();
      releases.delete(id);
      delete sessions[String(id)];
      transactionSnapshots.delete(id);
    }),
    rollbackTransaction: vi.fn(async (id: number) => {
      event = structuredClone(transactionSnapshots.get(id));
      releases.get(id)?.();
      releases.delete(id);
      delete sessions[String(id)];
      transactionSnapshots.delete(id);
    }),
  };
  const revalidate = vi.fn(async (_slugs: string[], req: PayloadRequest) => {
    expect(req.transactionID).toBeUndefined();
  });
  const canPublish = vi.fn(async () => true);
  const canManageData = vi.fn(async () => true);
  const canUseChat = vi.fn(async () => true);
  const api = {
    db,
    config: {
      custom: {
        [REALIZE_AI_SERVER_RUNTIME_KEY]: {
          canUseChat,
          canManageData,
          pageDraft: {
            publication: {
              version: "1.0",
              canPublish,
              check: async () => ({ checks: [], policyHash: "b".repeat(64) }),
              revalidate,
            },
          },
        },
      },
    },
    find: vi.fn(async (args: Record<string, unknown>) => {
      expect(args.collection).toBe(DATA_OPERATION_EVENTS_SLUG);
      return { docs: event ? [structuredClone(event)] : [] };
    }),
    create: vi.fn(async (args: Record<string, unknown>) => {
      expect(args.collection).toBe(DATA_OPERATION_EVENTS_SLUG);
      expect((args.req as PayloadRequest).transactionID).toBeDefined();
      event = {
        id: 55,
        ...(structuredClone(args.data) as Record<string, unknown>),
      };
      return structuredClone(event);
    }),
    update: vi.fn(async (args: Record<string, unknown>) => {
      expect(args.collection).toBe(DATA_OPERATION_EVENTS_SLUG);
      expect((args.req as PayloadRequest).transactionID).toBeDefined();
      if (!event) throw new Error("Event missing");
      event = {
        ...event,
        ...(structuredClone(args.data) as Record<string, unknown>),
      };
      return structuredClone(event);
    }),
  };
  const req = {
    user: { id: 1, collection: "users", roles: ["admin"] },
    context: {},
    payload: api,
  } as unknown as PayloadRequest;
  const enqueue = async () =>
    await withPayloadTransaction(
      req,
      async () => await createPagePublicationDelivery(req, operation),
    );
  return {
    req,
    operation,
    snapshot,
    api,
    db,
    owned,
    revalidate,
    canPublish,
    canManageData,
    canUseChat,
    execute,
    enqueue,
    event: () => event!,
    setEvent: (value: AIDocument | undefined) => {
      event = value;
    },
  };
};

describe("Publication delivery outbox", () => {
  it("создаёт один immutable event в общей транзакции и откатывается вместе с ней", async () => {
    const f = fixture();
    await withPayloadTransaction(f.req, async () => {
      await createPagePublicationDelivery(f.req, f.operation);
      await createPagePublicationDelivery(f.req, f.operation);
    });
    expect(f.api.create).toHaveBeenCalledTimes(1);
    expect(f.event()).toMatchObject({
      type: "publication_delivery_requested",
      toState: "applied",
      idempotencyKey: "publication-delivery:2",
      deliveryStatus: "pending",
      payload: {
        version: "1.0",
        operationHash: f.operation.operationHash,
        operationVersion: 3,
        pageID: "7",
        slugs: ["home", "delivery"],
      },
    });
    expect(await getPagePublicationDelivery(f.req, "2")).toEqual({
      status: "pending",
    });
    f.setEvent(undefined);
    await expect(
      withPayloadTransaction(f.req, async () => {
        await createPagePublicationDelivery(f.req, f.operation);
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(f.event()).toBeUndefined();
    expect(f.revalidate).not.toHaveBeenCalled();
  });
  it("поддерживает отдельное восстановление и dedupe одинаковых slug", async () => {
    const f = fixture();
    f.operation.kind = "pages.restorePublication.v1";
    f.snapshot.beforePage.slug = "delivery";
    await f.enqueue();
    expect((f.event().payload as Record<string, unknown>).slugs).toEqual([
      "delivery",
    ]);
    await deliverPagePublication(f.req, f.operation);
    expect(await getPagePublicationDelivery(f.req, "2")).toMatchObject({
      status: "succeeded",
    });
  });
  it.each([undefined, null, ""])(
    "первая публикация без старого slug %s обновляет только целевой адрес",
    async (oldSlug) => {
      const f = fixture();
      f.snapshot.beforePage.slug = oldSlug;
      f.snapshot.beforePage._status = "draft";
      await f.enqueue();
      await deliverPagePublication(f.req, f.operation);
      expect(f.revalidate).toHaveBeenCalledWith(["delivery"], f.req);
    },
  );
  it.each(["published-old", "target"])(
    "пустой обязательный slug отклоняется: %s",
    async (target) => {
      const f = fixture();
      if (target === "published-old") {
        f.snapshot.beforePage._status = "published";
        f.snapshot.beforePage.slug = null;
      } else f.snapshot.targetPage.slug = "";
      await expect(f.enqueue()).rejects.toThrow();
      expect(f.api.create).not.toHaveBeenCalled();
      expect(f.revalidate).not.toHaveBeenCalled();
    },
  );
  it("доставляет после commit, изменяет только delivery metadata и не повторяет delivered", async () => {
    const f = fixture();
    await f.enqueue();
    const before = structuredClone(f.event());
    await deliverPagePublication(f.req, f.operation);
    expect(f.revalidate).toHaveBeenCalledWith(["home", "delivery"], f.req);
    expect(f.event().payload).toEqual(before.payload);
    expect(f.event().idempotencyKey).toBe(before.idempotencyKey);
    const write = f.api.update.mock.calls[0][0];
    expect(Object.keys(write.data as object).sort()).toEqual([
      "deliveredAt",
      "deliveryError",
      "deliveryStatus",
    ]);
    expect(write.overrideAccess).toBe(true);
    expect(f.execute).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext('realize:pages:draft-writes'))",
    );
    expect(await getPagePublicationDelivery(f.req, "2")).toEqual({
      status: "succeeded",
      deliveredAt: f.event().deliveredAt,
    });
    await deliverPagePublication(f.req, f.operation);
    expect(f.revalidate).toHaveBeenCalledTimes(1);
    expect(f.api.update).toHaveBeenCalledTimes(1);
  });
  it("сохраняет безопасный failure и повторяет только cache delivery", async () => {
    const f = fixture();
    await f.enqueue();
    f.revalidate.mockRejectedValueOnce(
      new Error("https://secret.invalid/?token=private-value"),
    );
    await expect(
      deliverPagePublication(f.req, f.operation),
    ).resolves.toBeUndefined();
    const failed = await getPagePublicationDelivery(f.req, "2");
    expect(failed.status).toBe("failed");
    expect(JSON.stringify(failed)).not.toMatch(
      /token|private-value|secret.invalid/,
    );
    expect(f.event().deliveryError).toBe(failed.message);
    await deliverPagePublication(f.req, f.operation);
    expect((await getPagePublicationDelivery(f.req, "2")).status).toBe(
      "succeeded",
    );
    expect(f.api.create).toHaveBeenCalledTimes(1);
    expect(f.revalidate).toHaveBeenCalledTimes(2);
  });
  it("pending после сбоя persistence допускает повтор без новой публикации", async () => {
    const f = fixture();
    await f.enqueue();
    f.api.update.mockRejectedValueOnce(new Error("db unavailable"));
    await expect(deliverPagePublication(f.req, f.operation)).rejects.toThrow(
      "db unavailable",
    );
    expect((await getPagePublicationDelivery(f.req, "2")).status).toBe(
      "pending",
    );
    await deliverPagePublication(f.req, f.operation);
    expect((await getPagePublicationDelivery(f.req, "2")).status).toBe(
      "succeeded",
    );
    expect(f.revalidate).toHaveBeenCalledTimes(2);
  });
  it("поздний failure не затирает параллельно сохранённый delivered", async () => {
    const f = fixture();
    await f.enqueue();
    let rejectFirst!: (reason: Error) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    f.revalidate.mockImplementationOnce(async () => {
      signalStarted();
      await new Promise<void>((_resolve, reject) => {
        rejectFirst = reject;
      });
    });
    const first = deliverPagePublication(f.req, f.operation);
    await started;
    const concurrentReq = { ...f.req, context: {} } as PayloadRequest;
    await deliverPagePublication(concurrentReq, f.operation);
    rejectFirst(new Error("late failure"));
    await first;
    expect(f.event().deliveryStatus).toBe("delivered");
    expect(f.event().deliveryError).toBeNull();
    expect(f.api.update).toHaveBeenCalledTimes(1);
  });
  it.each([
    "anonymous",
    "revoked",
    "foreign",
    "active-transaction",
    "stale-version",
    "stale-hash",
    "wrong-state",
    "wrong-kind",
    "tampered-payload",
    "missing-event",
  ])("отклоняет недопустимую доставку до cache effect: %s", async (reason) => {
    const f = fixture();
    await f.enqueue();
    const supplied = structuredClone(f.operation);
    if (reason === "anonymous") f.req.user = null;
    if (reason === "revoked") f.canPublish.mockResolvedValue(false);
    if (reason === "foreign") f.req.user = { ...f.req.user!, id: 99 };
    if (reason === "active-transaction") f.req.transactionID = 99;
    if (reason === "stale-version") f.operation.version = 4;
    if (reason === "stale-hash") f.operation.operationHash = "f".repeat(64);
    if (reason === "wrong-state")
      f.operation.state = supplied.state = "approved";
    if (reason === "wrong-kind")
      f.operation.kind = supplied.kind = "pages.updateDraft.v1";
    if (reason === "tampered-payload")
      (f.event().payload as Record<string, unknown>).slugs = ["admin"];
    if (reason === "missing-event") f.setEvent(undefined);
    await expect(deliverPagePublication(f.req, supplied)).rejects.toThrow();
    expect(f.revalidate).not.toHaveBeenCalled();
    expect(f.api.update).not.toHaveBeenCalled();
  });
  it("не читает private event DTO без владения и не выводит его поля", async () => {
    const f = fixture();
    await f.enqueue();
    f.event().deliveryStatus = "failed";
    f.event().deliveryError = "private-secret";
    f.event().actorNote = "private-actor-note";
    expect(
      JSON.stringify(await getPagePublicationDelivery(f.req, "2")),
    ).not.toMatch(/private|actor|payload|operationHash|slugs/);
    f.api.find.mockClear();
    f.req.user = { ...f.req.user!, id: 99 };
    await expect(getPagePublicationDelivery(f.req, "2")).rejects.toThrow();
    expect(f.api.find).not.toHaveBeenCalled();
  });
  it("сохраняет доступ владельца к истории при отзыве write прав и требует их для retry", async () => {
    const f = fixture();
    await f.enqueue();
    f.canManageData.mockResolvedValue(false);
    f.canPublish.mockResolvedValue(false);
    expect(await getPagePublicationDelivery(f.req, "2")).toEqual({
      status: "pending",
    });
    await expect(
      deliverPagePublication(f.req, f.operation),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.revalidate).not.toHaveBeenCalled();
    Reflect.deleteProperty(
      f.api.config.custom[REALIZE_AI_SERVER_RUNTIME_KEY].pageDraft,
      "publication",
    );
    expect(await getPagePublicationDelivery(f.req, "2")).toEqual({
      status: "pending",
    });
    f.canUseChat.mockResolvedValue(false);
    f.api.find.mockClear();
    await expect(getPagePublicationDelivery(f.req, "2")).rejects.toMatchObject({
      status: 403,
    });
    expect(f.api.find).not.toHaveBeenCalled();
  });
  it("не создаёт event вне transaction и для непубликационного kind", async () => {
    const f = fixture();
    await expect(
      createPagePublicationDelivery(f.req, f.operation),
    ).rejects.toThrow();
    f.operation.kind = "pages.updateDraft.v1";
    await expect(f.enqueue()).rejects.toThrow();
    expect(f.api.create).not.toHaveBeenCalled();
    expect(f.revalidate).not.toHaveBeenCalled();
  });
});
