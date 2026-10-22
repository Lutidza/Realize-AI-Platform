/**
 * @file tests/int/pageDraftContracts.int.spec.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет недоверенный intent страницы, точное подтверждение рецепта и протокол управляемого создания.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import {
  ContractValidationError,
  parseCreatePageDraftIntent,
  parseDataOperationIntent,
  type CreatePageDraftIntent,
} from "@realize/ai-contracts";
import {
  PAGES_CREATE_DRAFT_CAPABILITY,
  SYSTEM_CAPABILITY_REGISTRY,
  SYSTEM_AI_CONFIG_PROJECTION,
  buildDataOperationProtocolInstructions,
  compileAgentConfiguration,
  createAIConfigRelease,
  createPageDraftOperationHash,
  createPageDraftRollbackHash,
  hasDataOperationIntent,
  parseDataOperationIntentFromAssistant,
  stripDataOperationProtocol,
} from "@realize/change-engine";
import { describe, expect, it } from "vitest";
import { createAIConfigDraftFixture } from "./fixtures/aiConfiguration";

const intent: CreatePageDraftIntent = {
  description: "Демонстрационная страница о компании",
  kind: "pages.createDraft.v1",
  sections: [
    {
      heading: "О нас",
      body: "Демонстрационный текст о компании.\nВторой абзац.",
    },
  ],
  slug: "about",
  title: "О компании",
  version: "1.0",
};

describe("контракт создания черновика страницы", () => {
  it("нормализует bounded plain text и сохраняет выбор операции", () => {
    expect(
      parseCreatePageDraftIntent({ ...intent, title: " О компании " }),
    ).toEqual(intent);
    expect(parseDataOperationIntent(intent)).toEqual(intent);
    const minimal = {
      ...intent,
      description: undefined,
      sections: [{ body: "Текст" }],
    };
    expect(parseDataOperationIntent(minimal)).toEqual({
      kind: intent.kind,
      sections: [{ body: "Текст" }],
      slug: intent.slug,
      title: intent.title,
      version: intent.version,
    });
  });

  it("сохраняет совместимый parser операции каталога", () => {
    const category = {
      category: { slug: "accessories" },
      kind: "catalog.assignCategory.v1",
      product: { id: "7" },
      version: "1.0",
    };
    expect(parseDataOperationIntent(category)).toEqual(category);
  });

  it.each([
    { _status: "published" },
    { layout: [{ blockType: "content", columns: [] }] },
    { hero: { type: "none" } },
    { sql: "DROP TABLE pages" },
    { sections: [{ body: "Текст", richText: { root: {} } }] },
    { sections: [{ body: { root: {} } }] },
    { kind: "pages.publish.v1" },
    { version: "2.0" },
  ])("отклоняет незаявленные права и структуру: %j", (patch) => {
    expect(() => parseDataOperationIntent({ ...intent, ...patch })).toThrow(
      ContractValidationError,
    );
  });

  it("отклоняет HTML и управляющие символы в любом текстовом поле", () => {
    for (const patch of [
      { title: "<script>alert(1)</script>" },
      { description: "<img src=x onerror=alert(1)>" },
      { sections: [{ heading: "<!-- x -->", body: "text" }] },
      { sections: [{ body: "Пример\u0000текста" }] },
      { title: "Два\nзаголовка" },
    ]) {
      expect(() => parseCreatePageDraftIntent({ ...intent, ...patch })).toThrow(
        ContractValidationError,
      );
    }
  });

  it("ограничивает slug одним безопасным сегментом маршрута", () => {
    for (const slug of [
      "/about",
      "../about",
      "a/b",
      "about?preview=true",
      "ABOUT",
      "about--us",
      "-about",
      "about-",
      "о-компании",
      "a".repeat(101),
    ]) {
      expect(() => parseCreatePageDraftIntent({ ...intent, slug })).toThrow(
        ContractValidationError,
      );
    }
    expect(
      parseCreatePageDraftIntent({ ...intent, slug: "about-us-2" }).slug,
    ).toBe("about-us-2");
  });

  it("ограничивает размер каждого поля и всего документа", () => {
    for (const patch of [
      { title: "" },
      { title: "x".repeat(161) },
      { description: "x".repeat(321) },
      { sections: [] },
      { sections: Array.from({ length: 13 }, () => ({ body: "x" })) },
      { sections: [{ heading: "x".repeat(161), body: "x" }] },
      { sections: [{ body: "x".repeat(4001) }] },
      {
        sections: Array.from({ length: 5 }, () => ({ body: "x".repeat(4000) })),
      },
    ]) {
      expect(() => parseCreatePageDraftIntent({ ...intent, ...patch })).toThrow(
        ContractValidationError,
      );
    }
  });
});

describe("подтверждение рецепта страницы", () => {
  const recipe = {
    createDataHash: "1".repeat(64),
    intent,
    mapperVersion: "1.0",
  };

  it("связывает approval со slug, текстом, порядком секций и точным серверным snapshot", () => {
    const baseline = createPageDraftOperationHash(recipe);
    expect(baseline).toMatch(/^[a-f0-9]{64}$/);
    for (const patch of [
      { createDataHash: "2".repeat(64) },
      { mapperVersion: "1.1" },
      { intent: { ...intent, slug: "about-us" } },
      { intent: { ...intent, sections: [{ body: "Другой текст" }] } },
      { intent: { ...intent, description: "Другой SEO-текст" } },
    ]) {
      expect(createPageDraftOperationHash({ ...recipe, ...patch })).not.toBe(
        baseline,
      );
    }
    const twoSections = [{ body: "Первый" }, { body: "Второй" }];
    expect(
      createPageDraftOperationHash({
        ...recipe,
        intent: { ...intent, sections: twoSections },
      }),
    ).not.toBe(
      createPageDraftOperationHash({
        ...recipe,
        intent: { ...intent, sections: [...twoSections].reverse() },
      }),
    );
    expect(
      createPageDraftOperationHash({
        mapperVersion: "1.0",
        intent,
        createDataHash: "1".repeat(64),
      }),
    ).toBe(baseline);
  });

  it("после apply заменяет rollback hash привязкой к созданному неизменённому draft", () => {
    const operationHash = createPageDraftOperationHash(recipe);
    const applied = {
      operationHash,
      pageID: "7",
      updatedAt: "2026-09-11T12:00:00.000Z",
      fingerprint: "3".repeat(64),
    };
    const baseline = createPageDraftRollbackHash(applied);
    expect(baseline).not.toBe(createPageDraftRollbackHash({ operationHash }));
    for (const patch of [
      { pageID: "8" },
      { updatedAt: "2026-09-11T12:01:00.000Z" },
      { fingerprint: "4".repeat(64) },
      { operationHash: "5".repeat(64) },
    ]) {
      expect(createPageDraftRollbackHash({ ...applied, ...patch })).not.toBe(
        baseline,
      );
    }
    expect(() =>
      createPageDraftRollbackHash({ ...applied, fingerprint: "" }),
    ).toThrow("requires pageID");
  });
});

describe("доступный агенту протокол страницы", () => {
  it("извлекает одну page proposal и скрывает machine block в ответе", () => {
    const response = `Подготовлю черновик после подтверждения.\n\n\`\`\`realize-data-operation\n${JSON.stringify(intent)}\n\`\`\``;
    expect(parseDataOperationIntentFromAssistant(response)).toEqual(intent);
    expect(hasDataOperationIntent(response)).toBe(true);
    expect(stripDataOperationProtocol(response)).toBe(
      "Подготовлю черновик после подтверждения.",
    );
    expect(() =>
      parseDataOperationIntentFromAssistant(`${response}\n${response}`),
    ).toThrow("несколько");
    expect(
      hasDataOperationIntent(
        response.replace('"pages.createDraft.v1"', '"pages.publish.v1"'),
      ),
    ).toBe(false);
  });

  it("объясняет управляемую запись несмотря на readonly и требует UI approval", () => {
    const protocol = buildDataOperationProtocolInstructions();
    expect(protocol).toContain(
      "Do not refuse a supported page draft request because your chat session is read-only",
    );
    expect(protocol).toContain("pages.createDraft.v1");
    expect(protocol).toContain("not a code change");
    expect(protocol).toContain("always creates an unpublished draft");
    expect(protocol).toContain("not a hash-bound approval");
    expect(protocol).toContain("Подготовить изменение данных");
    expect(protocol).toContain("Подтвердить создание");
    expect(protocol).toContain("Создать черновик");
    expect(protocol).toContain("Открыть черновик");
    expect(protocol).toContain("Do not claim to have checked the database");
  });

  it("регистрирует exact capability с narrow page draft scope и подтверждением отката", () => {
    expect(
      SYSTEM_CAPABILITY_REGISTRY.require({
        id: "pages.createDraft.v1",
        version: "1.0",
      }),
    ).toEqual(PAGES_CREATE_DRAFT_CAPABILITY);
    expect(PAGES_CREATE_DRAFT_CAPABILITY.actions).toEqual(["page.createDraft"]);
    expect(PAGES_CREATE_DRAFT_CAPABILITY.scopes.write).toEqual([
      "payload.pages.draft",
    ]);
    expect(PAGES_CREATE_DRAFT_CAPABILITY.approvals).toEqual([
      "write_confirmation",
      "rollback_confirmation",
    ]);
    expect(PAGES_CREATE_DRAFT_CAPABILITY.limits).toEqual({
      maxBatchSize: 1,
      maxTargets: 1,
    });
    expect(
      SYSTEM_CAPABILITY_REGISTRY.get({
        id: "pages.createDraft.v1",
        version: "1.1",
      }),
    ).toBeUndefined();
    expect(Object.isFrozen(PAGES_CREATE_DRAFT_CAPABILITY.scopes.write)).toBe(
      true,
    );
  });

  it("сохраняет catalog-only bindings совместимого release без автоматической выдачи page binding", () => {
    const release = createAIConfigRelease({
      createdAt: "2026-09-01T08:00:00.000Z",
      createdBy: "admin-1",
      draft: createAIConfigDraftFixture(),
      releaseID: "catalog-only-v1",
      releaseVersion: 1,
      systemCompatibility: {
        maximumRelease: SYSTEM_AI_CONFIG_PROJECTION.version,
        minimumRelease: "1.0.0",
      },
    });
    const compiled = compileAgentConfiguration({
      profileKey: "admin",
      release,
      system: SYSTEM_AI_CONFIG_PROJECTION,
    });
    expect(
      compiled.capabilities.map((binding) => binding.capability.id),
    ).toEqual(["catalog.assignCategory.v1"]);
    expect(
      compiled.capabilities.some((binding) =>
        binding.actions.includes("page.createDraft"),
      ),
    ).toBe(false);
  });
});
