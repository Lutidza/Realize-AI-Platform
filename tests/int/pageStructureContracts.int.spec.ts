// @vitest-environment node
/**
 * @file tests/int/pageStructureContracts.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет строгий контракт структурных команд, полный preview и namespace подтверждений.
 */
import { describe, expect, it } from "vitest";
import {
  parseUpdatePageStructureDraftIntent,
  parsePageDraftContentPreview,
  parsePageDraftStructurePreview,
  type UpdatePageStructureDraftIntent,
} from "@realize/ai-contracts";
import {
  createPageDraftStructureOperationHash,
  createPageDraftStructureRollbackHash,
  createPageDraftUpdateRollbackHash,
  hashCanonicalJSON,
} from "@realize/change-engine";

const intent = (): UpdatePageStructureDraftIntent => ({
  kind: "pages.updateStructureDraft.v1",
  version: "1.0",
  pageID: "19",
  expectedUpdatedAt: "2026-09-13T09:00:00.000Z",
  expectedFingerprint: "c".repeat(64),
  expectedCatalogHash: "d".repeat(64),
  operation: {
    type: "insert",
    beforeBlockID: null,
    section: {
      heading: "Доставка",
      body: "Привезём заказ.\nПозвоним заранее.",
    },
  },
});
const preview = () => ({
  page: { id: "19", title: "Доставка" },
  status: "draft",
  action: "insert",
  blockID: "server-created",
  beforeIndex: null,
  afterIndex: 3,
  totalBefore: 3,
  totalAfter: 4,
  beforeBlockID: null,
  content: { columns: [{ size: "full", text: "Доставка\nПривезём заказ." }] },
});

describe("Контракты структурного изменения страницы", () => {
  it("принимает одну команду со стабильными IDs и явным концом layout", () => {
    expect(parseUpdatePageStructureDraftIntent(intent())).toEqual(intent());
    expect(
      parseUpdatePageStructureDraftIntent({
        ...intent(),
        operation: {
          type: "move",
          blockID: "existing",
          beforeBlockID: "anchor",
        },
      }).operation,
    ).toEqual({ type: "move", blockID: "existing", beforeBlockID: "anchor" });
    expect(
      parseUpdatePageStructureDraftIntent({
        ...intent(),
        operation: { type: "remove", blockID: "existing" },
      }).operation,
    ).toEqual({ type: "remove", blockID: "existing" });
  });
  it.each([
    { writeData: { _status: "published" } },
    { layout: [] },
    { collection: "forms" },
    { expectedCatalogHash: undefined },
    { expectedFingerprint: "bad-hash" },
    { expectedUpdatedAt: "yesterday" },
    { pageID: "../19" },
    { version: "2.0" },
  ])("отклоняет raw/protected поля или непроверяемую ревизию: %j", (change) => {
    expect(() =>
      parseUpdatePageStructureDraftIntent({ ...intent(), ...change }),
    ).toThrow();
  });
  it.each([
    {
      type: "insert",
      beforeBlockID: null,
      blockType: "formBlock",
      section: { body: "Текст" },
    },
    {
      type: "insert",
      beforeBlockID: null,
      blockID: "model-created",
      section: { body: "Текст" },
    },
    {
      type: "insert",
      beforeBlockID: null,
      section: { body: "Текст", richText: { root: {} } },
    },
    { type: "insert", section: { body: "Текст" } },
    {
      type: "insert",
      beforeBlockID: null,
      section: { body: "<script>alert(1)</script>" },
    },
    { type: "insert", beforeBlockID: null, section: { body: "  " } },
    { type: "remove", blockID: "id", beforeBlockID: null },
    { type: "move", blockID: "same", beforeBlockID: "same" },
    { type: "move", blockID: "id", beforeIndex: 0 },
    [
      { type: "remove", blockID: "one" },
      { type: "remove", blockID: "two" },
    ],
  ])(
    "не позволяет заменить узкую команду произвольной структурой: %j",
    (operation) => {
      expect(() =>
        parseUpdatePageStructureDraftIntent({ ...intent(), operation }),
      ).toThrow();
    },
  );

  it("сохраняет весь literal текст preview без превращения его в HTML", () => {
    const content = {
      columns: [
        { size: "half", text: "Исходный <b>literal</b> текст\nВторая строка" },
        { size: "half", text: "" },
      ],
    };
    expect(parsePageDraftContentPreview(content)).toEqual(content);
    expect(parsePageDraftStructurePreview(preview())).toEqual(preview());
  });
  it("принимает preview первого блока в пустом layout", () => {
    const firstBlock = {
      ...preview(),
      afterIndex: 0,
      totalBefore: 0,
      totalAfter: 1,
    };
    expect(parsePageDraftStructurePreview(firstBlock)).toEqual(firstBlock);
    expect(() =>
      parsePageDraftStructurePreview({ ...firstBlock, totalBefore: -1 }),
    ).toThrow();
  });
  it.each([
    { columns: [] },
    { columns: Array.from({ length: 17 }, () => ({ size: "full", text: "" })) },
    { columns: [{ size: "full", text: "x".repeat(16001) }] },
    {
      columns: [
        { size: "full", text: "Ж".repeat(16000) },
        { size: "full", text: "Ж".repeat(1000) },
      ],
    },
    { columns: [{ size: "full", text: "Текст", truncated: true }] },
    {
      columns: [
        {
          size: "full",
          text: "Текст",
          references: [{ collection: "forms", id: 12 }],
        },
      ],
    },
    { columns: [{ size: "full", text: "Текст", richText: { root: {} } }] },
  ])("не допускает обрезанный, чрезмерный или сырой preview: %j", (content) => {
    expect(() => parsePageDraftContentPreview(content)).toThrow();
  });
  it.each([
    { status: "published" },
    { content: undefined },
    { beforeIndex: 1 },
    { afterIndex: 1 },
    { totalAfter: 3 },
    { beforeBlockID: "anchor" },
    { beforeBlockID: "server-created" },
    { rawPage: {} },
  ])("отклоняет противоречивый insert preview: %j", (change) => {
    expect(() =>
      parsePageDraftStructurePreview({ ...preview(), ...change }),
    ).toThrow();
  });
  it("move не несёт текст, remove требует полный текст и не может опустошить страницу", () => {
    const move = {
      ...preview(),
      action: "move",
      beforeIndex: 0,
      afterIndex: 2,
      totalBefore: 3,
      totalAfter: 3,
      content: undefined,
    };
    expect(parsePageDraftStructurePreview(move)).not.toHaveProperty("content");
    expect(() =>
      parsePageDraftStructurePreview({ ...move, content: preview().content }),
    ).toThrow();
    const remove = {
      ...preview(),
      action: "remove",
      beforeIndex: 0,
      afterIndex: null,
      totalAfter: 2,
    };
    expect(parsePageDraftStructurePreview(remove).content).toEqual(
      preview().content,
    );
    expect(() =>
      parsePageDraftStructurePreview({
        ...remove,
        totalBefore: 1,
        totalAfter: 0,
      }),
    ).toThrow();
  });

  it("operation hash включает каталог и собственный namespace", () => {
    const input = { intent: intent(), snapshotHash: "a".repeat(64) };
    const hash = createPageDraftStructureOperationHash(input);
    expect(hash).not.toBe(hashCanonicalJSON(input));
    expect(hash).not.toBe(
      createPageDraftStructureOperationHash({
        ...input,
        intent: { ...input.intent, expectedCatalogHash: "b".repeat(64) },
      }),
    );
    expect(hash).not.toBe(
      createPageDraftStructureOperationHash({
        ...input,
        snapshotHash: "b".repeat(64),
      }),
    );
  });
  it("rollback привязан к полной применённой ревизии и не совпадает с text rollback", () => {
    const input = {
      operationHash: "a".repeat(64),
      pageID: "19",
      updatedAt: intent().expectedUpdatedAt,
      fingerprint: "c".repeat(64),
      adapterVersion: "1.0",
      catalogHash: "d".repeat(64),
    };
    const hash = createPageDraftStructureRollbackHash(input);
    expect(hash).not.toBe(createPageDraftUpdateRollbackHash(input));
    expect(hash).not.toBe(
      createPageDraftStructureRollbackHash({
        ...input,
        catalogHash: "e".repeat(64),
      }),
    );
    expect(hash).not.toBe(
      createPageDraftStructureRollbackHash({
        operationHash: input.operationHash,
      }),
    );
    expect(() =>
      createPageDraftStructureRollbackHash({
        ...input,
        catalogHash: undefined,
      }),
    ).toThrow("complete");
    expect(() =>
      createPageDraftStructureRollbackHash({
        operationHash: input.operationHash,
        catalogHash: input.catalogHash,
      }),
    ).toThrow("complete");
  });
});
