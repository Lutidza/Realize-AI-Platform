// @vitest-environment node
/**
 * @file tests/int/pagePublicationService.int.spec.ts
 * @version 1.2.0
 * @date 2026-09-14
 * @description Проверяет exact publish/restore, сохранение рабочего draft, CAS/policy/ACL и контроль результата Payload.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Payload, PayloadRequest } from "payload";
import { hashCanonicalJSON } from "@realize/change-engine";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../../packages/payload-ai-plugin/src/constants";
import { PagePublication } from "../../packages/payload-ai-plugin/src/endpoints/pagePublication.service";
import { PageKnowledge } from "../../packages/payload-ai-plugin/src/endpoints/pageKnowledge.service";
import { DataOperationRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationRepository";
import { pagePublicationOperationHash } from "../../packages/payload-ai-plugin/src/endpoints/pagePublicationSnapshot.mapper";
import {
  preparePagePublicationApproval,
  assertPagePublicationReviewApproval,
} from "../../packages/payload-ai-plugin/src/endpoints/pagePublicationApproval.service";
import { toDataOperationDTO } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationMapper";
import { EndpointError } from "../../packages/payload-ai-plugin/src/endpoints/http";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import type { PagePublicationSnapshot } from "../../packages/payload-ai-plugin/src/endpoints/PagePublication.types";

afterEach(() => vi.restoreAllMocks());
const time = "2026-09-14T00:00:00.000Z";
const hash = "a".repeat(64);
const fixture = (wasPublished = false) => {
  let base: AIDocument = {
    id: 7,
    title: "До публикации",
    slug: "delivery",
    hero: { type: "none" },
    layout: [{ blockType: "content", body: "Старый текст" }],
    meta: { title: null, description: null, image: null },
    publishedOn: wasPublished ? time : null,
    createdAt: time,
    updatedAt: time,
    _status: wasPublished ? "published" : "draft",
  };
  let draft: AIDocument = {
    ...structuredClone(base),
    title: "Доставка",
    layout: [{ blockType: "content", body: "Проверенный текст" }],
    _status: "draft",
  };
  let latestID = 10;
  let publication: AIDocument | null = wasPublished
    ? { id: 9, updatedAt: time, version: structuredClone(base) }
    : null;
  const policy = {
    checks: [
      {
        id: "publication-static",
        status: "passed" as const,
        severity: "info" as const,
        message: "Поддержанная страница.",
      },
    ],
    policyHash: "b".repeat(64),
  };
  const catalog = {
    version: "1.0" as const,
    hash: "d".repeat(64),
    definitions: [],
  };
  vi.spyOn(PageKnowledge.prototype, "catalog").mockImplementation(() =>
    structuredClone(catalog),
  );
  const canPublish = vi.fn(async () => true);
  const canUse = vi.fn(async () => true);
  const access = vi.fn(async () => true);
  const execute = vi.fn(async () => {});
  let alterWrite = false;
  const source: AIDocument = {
    id: 1,
    kind: "pages.updateDraft.v1",
    state: "applied",
    version: 3,
    operationHash: hash,
    appliedSnapshot: {
      pageID: "7",
      updatedAt: time,
      adapterVersion: "1.0",
      fingerprint: hashCanonicalJSON({
        page: draft,
        latestVersion: { id: "10", updatedAt: time },
        baseFingerprint: hashCanonicalJSON(base),
        publicationFingerprint: hashCanonicalJSON(publication),
        adapterVersion: "1.0",
      }),
    },
  };
  const records = new Map<string, AIDocument>([["1", source]]);
  const api = {
    config: {
      routes: { admin: "/admin" },
      custom: {
        [REALIZE_AI_SERVER_RUNTIME_KEY]: {
          canUseChat: canUse,
          canManageData: canUse,
          pageDraft: {
            publication: {
              version: "1.0",
              canPublish,
              check: vi.fn(async () => structuredClone(policy)),
              revalidate: vi.fn(),
            },
          },
        },
      },
    },
    collections: { pages: { config: { access: { update: access } } } },
    db: {
      name: "postgres",
      defaultIDType: "number",
      sessions: { tx: { db: { execute } } },
    },
    find: vi.fn(async (args: Record<string, unknown>) => ({
      docs: [structuredClone(args.draft ? draft : base)],
    })),
    findVersions: vi.fn(async (args: Record<string, unknown>) => ({
      docs: JSON.stringify(args.where).includes('"latest"')
        ? [{ id: latestID, updatedAt: draft.updatedAt }]
        : publication
          ? [structuredClone(publication)]
          : [],
    })),
    update: vi.fn(
      async (args: {
        data: Record<string, unknown>;
        draft?: boolean;
        req: PayloadRequest;
        overrideAccess: boolean;
        overrideLock: boolean;
      }) => {
        expect(args.overrideAccess).toBe(false);
        expect(args.overrideLock).toBe(false);
        expect(args.req.context.disableRevalidate).toBe(true);
        latestID++;
        draft = {
          ...draft,
          ...structuredClone(args.data),
          updatedAt: new Date(Date.parse(time) + latestID * 1000).toISOString(),
        };
        if (draft._status === "published" && !draft.publishedOn)
          draft.publishedOn = time;
        if (alterWrite) draft.title = "Hook изменил содержимое";
        if (!args.draft) base = structuredClone(draft);
        if (draft._status === "published")
          publication = {
            id: latestID,
            updatedAt: draft.updatedAt,
            version: structuredClone(draft),
          };
        return structuredClone(draft);
      },
    ),
  };
  const req = {
    payload: api as unknown as Payload,
    user: { id: 1 },
    context: { fixture: true },
    transactionID: "tx",
  } as unknown as PayloadRequest;
  vi.spyOn(
    DataOperationRepository.prototype,
    "getOwnedOperation",
  ).mockImplementation(async (id, userID) => {
    if (String(userID) !== "1" || !records.has(id))
      throw new EndpointError("NOT_FOUND", "Unavailable fixture", 404);
    return records.get(id)!;
  });
  const service = new PagePublication(api as unknown as Payload, req);
  const operation = (
    snapshot: PagePublicationSnapshot,
    id = "2",
  ): AIDocument => {
    const kind =
      snapshot.mode === "publish"
        ? "pages.publishDraft.v1"
        : "pages.restorePublication.v1";
    const result: AIDocument = {
      id,
      kind,
      version: 2,
      state: "approved",
      createdAt: time,
      updatedAt: time,
      conversation: 1,
      sourceMessage: 1,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      operationHash: pagePublicationOperationHash(snapshot),
      rollbackHash: hash,
      afterSnapshot: snapshot,
      beforeSnapshot: snapshot.beforePage,
      intent: { kind, version: "1.0", sourceOperationID: snapshot.source.id },
    };
    records.set(id, result);
    return result;
  };
  const prepare = async () =>
    (
      await service.prepare(
        "1",
        {
          expectedVersion: 3,
          expectedOperationHash: hash,
        },
        "publish",
      )
    ).snapshot;
  return {
    api,
    req,
    service,
    prepare,
    operation,
    source,
    records,
    policy,
    catalog,
    canPublish,
    canUse,
    access,
    execute,
    base: () => structuredClone(base),
    draft: () => structuredClone(draft),
    editDraft: () => {
      draft = { ...draft, title: "Новый рабочий черновик" };
      latestID++;
    },
    editPublication: () => {
      base.title = "Чужая публикация";
    },
    alterWrite: () => {
      alterWrite = true;
    },
  };
};

describe("Точная публикация и восстановление Pages", () => {
  it.each([
    "pages.createDraft.v1",
    "pages.updateDraft.v1",
    "pages.updateStructureDraft.v1",
  ])(
    "принимает сохранённую source revision %s без отдельного preview token",
    async (kind) => {
      const f = fixture();
      f.source.kind = kind;
      if (kind === "pages.createDraft.v1")
        (f.source.appliedSnapshot as AIDocument).fingerprint =
          hashCanonicalJSON(f.draft());
      const plan = await f.prepare();
      const operation = f.operation(plan);
      const savedHash = operation.operationHash;
      const dto = toDataOperationDTO({
        operation,
        adminRoute: "/cms",
        apiRoute: "/cms-api/",
      });
      expect(dto).toMatchObject({
        adminUrl: "/cms/collections/pages/7",
        frontendPreviewUrl: `/cms-api/realize-ai/data-operations/${operation.id}/open-page`,
        operationHash: savedHash,
      });
      expect(operation.afterSnapshot).not.toHaveProperty("frontendPreviewUrl");
      expect(JSON.stringify(dto)).not.toContain("previewSecret");
      expect(plan).not.toHaveProperty("sourceManifestHash");
      expect(f.api.update).not.toHaveBeenCalled();
      f.editDraft();
      await expect(f.prepare()).rejects.toMatchObject({ status: 409 });
    },
  );
  it.each(["state", "kind", "fingerprint", "adapterVersion", "updatedAt"])(
    "не подменяет source draft при неверном %s",
    async (field) => {
      const f = fixture();
      if (field === "state") f.source.state = "rollback_approved";
      else if (field === "kind") f.source.kind = "catalog.assignCategory.v1";
      else (f.source.appliedSnapshot as AIDocument)[field] = "invalid";
      await expect(f.prepare()).rejects.toMatchObject({ status: 409 });
      expect(f.api.update).not.toHaveBeenCalled();
    },
  );
  it("читает сохранённую историю, но требует новый план после смены preview contract", async () => {
    const f = fixture();
    const saved = {
      ...(await f.prepare()),
      sourceManifestHash: "f".repeat(64),
    };
    const operation = f.operation(saved);
    expect(toDataOperationDTO({ operation })).toMatchObject({
      adminUrl: "/admin/collections/pages/7",
    });
    await expect(f.service.assertCurrent(operation)).rejects.toMatchObject({
      status: 409,
    });
    expect(f.api.update).not.toHaveBeenCalled();
  });
  it("редактирование в Live Preview после подготовки закрывает подтверждение", async () => {
    const f = fixture();
    const operation = f.operation(await f.prepare());
    const snapshot = operation.afterSnapshot as PagePublicationSnapshot;
    f.editDraft();
    await expect(
      preparePagePublicationApproval(f.req, operation, {
        manifestHash: snapshot.preview.manifestHash,
        desktop: true,
        mobile: true,
        noErrors: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.api.update).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "публикует выбранный draft; прежняя публикация=%s",
    async (wasPublished) => {
      const f = fixture(wasPublished);
      const plan = await f.prepare();
      const before = f.base();
      expect(f.api.update).not.toHaveBeenCalled();
      const operation = f.operation(plan);
      const result = await f.service.apply(operation);
      expect(f.base()).toMatchObject({
        title: "Доставка",
        _status: "published",
        layout: plan.targetPage.layout,
      });
      expect(f.draft()).toEqual(f.base());
      expect(plan.beforePage).toEqual(before);
      expect(result.appliedSnapshot.publicUrl).toBe("/delivery");
      expect(f.req.context).toEqual({ fixture: true });
      const dto = toDataOperationDTO({
        operation: { ...operation, ...result, state: "applied" },
      });
      expect(dto.riskLevel).toBe("R2");
      expect(dto).not.toHaveProperty("beforeSnapshot");
      expect(JSON.stringify(dto)).not.toContain("Проверенный текст");
    },
  );
  it.each([false, true])(
    "восстанавливает публичность и сохраняет более новый draft; прежде published=%s",
    async (wasPublished) => {
      const f = fixture(wasPublished);
      const original = f.base();
      const publish = f.operation(await f.prepare());
      Object.assign(publish, await f.service.apply(publish), {
        state: "applied",
        version: 3,
      });
      f.editDraft();
      const currentDraft = f.draft();
      const restore = await f.service.prepare(
        "2",
        {
          expectedVersion: 3,
          expectedOperationHash: String(publish.operationHash),
        },
        "restore",
      );
      await f.service.apply(f.operation(restore.snapshot, "3"));
      expect(f.base()._status).toBe(wasPublished ? "published" : "draft");
      if (wasPublished) expect(f.base().layout).toEqual(original.layout);
      expect(f.draft()).toMatchObject({
        title: currentDraft.title,
        layout: currentDraft.layout,
        _status: "draft",
      });
    },
  );
  it.each(["draft", "publication", "policy", "catalog", "source", "expiry"])(
    "закрывает план после изменения %s до записи",
    async (changed) => {
      const f = fixture();
      const operation = f.operation(await f.prepare());
      if (changed === "draft") f.editDraft();
      if (changed === "publication") f.editPublication();
      if (changed === "policy") f.policy.policyHash = "c".repeat(64);
      if (changed === "catalog") f.catalog.hash = "e".repeat(64);
      if (changed === "source") f.source.version = 4;
      if (changed === "expiry") operation.expiresAt = time;
      await expect(f.service.apply(operation)).rejects.toMatchObject({
        status: 409,
      });
      expect(f.api.update).not.toHaveBeenCalled();
    },
  );
  it("закрывает подготовленный restore после нового изменения draft", async () => {
    const f = fixture(true);
    const publish = f.operation(await f.prepare());
    Object.assign(publish, await f.service.apply(publish), {
      state: "applied",
      version: 3,
    });
    const restore = await f.service.prepare(
      "2",
      {
        expectedVersion: 3,
        expectedOperationHash: String(publish.operationHash),
      },
      "restore",
    );
    const operation = f.operation(restore.snapshot, "3");
    const writes = f.api.update.mock.calls.length;
    f.editDraft();
    await expect(f.service.apply(operation)).rejects.toMatchObject({
      status: 409,
    });
    expect(f.api.update).toHaveBeenCalledTimes(writes);
  });
  it("проверяет canPublish до lock и Pages ACL перед записью", async () => {
    const f = fixture();
    f.canPublish.mockResolvedValue(false);
    await expect(f.prepare()).rejects.toMatchObject({ status: 403 });
    expect(f.execute).not.toHaveBeenCalled();
    f.canPublish.mockResolvedValue(true);
    const operation = f.operation(await f.prepare());
    f.access.mockResolvedValue(false);
    await expect(f.service.apply(operation)).rejects.toMatchObject({
      status: 403,
    });
    expect(f.api.update).not.toHaveBeenCalled();
  });
  it("подтверждение просмотра обязательно и относится к publication manifest", async () => {
    const f = fixture();
    const snapshot = await f.prepare();
    const operation = f.operation(snapshot);
    await expect(
      preparePagePublicationApproval(f.req, operation, undefined),
    ).rejects.toThrow();
    await expect(
      preparePagePublicationApproval(f.req, operation, {
        manifestHash: hash,
        desktop: true,
        mobile: true,
        noErrors: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const evidence = await preparePagePublicationApproval(f.req, operation, {
      manifestHash: snapshot.preview.manifestHash,
      desktop: true,
      mobile: true,
      noErrors: true,
    });
    expect(() =>
      assertPagePublicationReviewApproval(operation, {
        id: 3,
        previewEvidence: evidence,
      }),
    ).not.toThrow();
    expect(() =>
      assertPagePublicationReviewApproval(operation, { id: 3 }),
    ).toThrow();
  });
  it("не объявляет успех после изменения содержимого Payload hook", async () => {
    const f = fixture();
    const operation = f.operation(await f.prepare());
    f.alterWrite();
    await expect(f.service.apply(operation)).rejects.toMatchObject({
      status: 409,
    });
    expect(f.req.context).toEqual({ fixture: true });
  });
});
