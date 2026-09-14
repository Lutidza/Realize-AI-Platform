// @vitest-environment node
/**
 * @file tests/int/pageKnowledgeContracts.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет границы каталога и порций структуры без изменения контракта текстового черновика.
 */
import { describe, expect, it } from "vitest";
import {
  parsePageArtifactCatalog,
  parsePageDraftContext,
  parsePageKnowledge,
  parsePageStructureContext,
  type PageArtifactDefinitionDTO,
  type PageBlockOutlineDTO,
  type PageKnowledgeDTO,
} from "@realize/ai-contracts";

const hash = "a".repeat(64);
const definition = (id = "pages"): PageArtifactDefinitionDTO => ({
  id,
  version: "1.0",
  kind: id === "pages" ? "collection" : "block",
  title: "Описание",
  description: "Зарегистрированная схема и доступные операции.",
  schema: { path: "src/collections/Pages/index.ts", exportName: "Pages" },
  renderer: { path: "src/app/(app)/[slug]/page.tsx", exportName: "default" },
  guide: {
    source: "src/collections/Pages/pageAgent.manifest.ts",
    version: "1.0",
    instructions: ["Проверьте ревизию перед подготовкой изменения."],
  },
  supportedOperations: [{ id: "pages.updateDraft.v1", version: "1.0" }],
  fields: [{ path: "/title", type: "text", required: true }],
});

const block = (index = 0, blockType = "content"): PageBlockOutlineDTO => ({
  id: `block-${index}`,
  identity: "stable",
  index,
  path: `/layout/${index}`,
  blockType,
  definitionID:
    blockType === "content"
      ? "blocks.content"
      : blockType === "formBlock"
        ? "blocks.formBlock"
        : null,
  settings:
    blockType === "content"
      ? [{ path: "/columns/count", value: 1 }]
      : blockType === "formBlock"
        ? [
            { path: "/enableIntro", value: false },
            { path: "/introContent/present", value: false },
          ]
        : [],
  references:
    blockType === "formBlock"
      ? [{ field: "form", collection: "forms", id: "11", access: "readable" }]
      : [],
});

const knowledge = (): PageKnowledgeDTO => ({
  version: "1.0",
  pageID: "17",
  fingerprint: hash,
  catalogHash: "b".repeat(64),
  definitions: [
    definition(),
    definition("blocks.content"),
    definition("blocks.formBlock"),
  ],
  outline: {
    offset: 0,
    limit: 32,
    totalBlocks: 2,
    nextOffset: null,
    blocks: [block(), block(1, "formBlock")],
  },
});
const catalog = () => ({
  version: "1.0",
  hash,
  definitions: knowledge().definitions,
});
const textContext = () => ({
  page: { id: "17", title: "О компании", slug: "about" },
  updatedAt: "2026-09-13T10:00:00.000Z",
  fingerprint: hash,
  adapterVersion: "1.0",
  fields: [
    { path: "/title", label: "Заголовок", value: "О компании", maxLength: 160 },
  ],
});
const structure = () => ({
  page: textContext().page,
  updatedAt: textContext().updatedAt,
  fingerprint: hash,
  knowledge: knowledge(),
});

describe("Каталог и контекст структуры страницы", () => {
  it("принимает явную проекцию каталога и обогащает прежний текстовый контекст", () => {
    const input = { ...textContext(), knowledge: knowledge() };
    expect(parsePageArtifactCatalog(catalog())).toEqual(catalog());
    expect(parsePageKnowledge(knowledge())).toEqual(knowledge());
    expect(parsePageDraftContext(textContext())).toEqual(textContext());
    const parsed = parsePageDraftContext(input);
    expect(parsed).toEqual(input);
    expect(parsed.knowledge).not.toBe(input.knowledge);
    expect(parsed.knowledge?.outline.blocks[0]).not.toBe(
      input.knowledge.outline.blocks[0],
    );
    expect(parsePageStructureContext(structure())).toEqual(structure());
  });

  it("проверяет привязку обоих контекстов к странице и fingerprint, дату и browser projection", () => {
    for (const change of [{ pageID: "18" }, { fingerprint: "c".repeat(64) }]) {
      const changed = { ...knowledge(), ...change };
      expect(() =>
        parsePageDraftContext({ ...textContext(), knowledge: changed }),
      ).toThrow();
      expect(() =>
        parsePageStructureContext({ ...structure(), knowledge: changed }),
      ).toThrow();
    }
    expect(() =>
      parsePageStructureContext({ ...structure(), updatedAt: "2026-09-13" }),
    ).toThrow();
    expect(() =>
      parsePageStructureContext({
        ...structure(),
        page: { ...textContext().page, _status: "draft" },
      }),
    ).toThrow();
    expect(() =>
      parsePageDraftContext({ ...textContext(), knowledge: null }),
    ).toThrow();
  });

  it("отклоняет raw record, лишние поля и неизвестные версии на вложенных границах", () => {
    const variants = [
      { ...knowledge(), page: { secret: "not a DTO" } },
      { ...knowledge(), version: "2.0" },
      { ...knowledge(), outline: { ...knowledge().outline, raw: {} } },
      {
        ...knowledge(),
        outline: {
          ...knowledge().outline,
          blocks: [{ ...block(), raw: {} }, block(1, "formBlock")],
        },
      },
    ];
    for (const value of variants)
      expect(() => parsePageKnowledge(value)).toThrow();
    for (const change of [
      { version: "2.0" },
      { kind: "utility" },
      { id: "other.plugin" },
      { id: ["pages"], kind: "block" },
      { guide: { ...definition().guide, permission: "write" } },
      { schema: { ...definition().schema, fields: {} } },
      { fields: [{ ...definition().fields[0], defaultValue: "unsafe" }] },
      {
        supportedOperations: [
          { id: "pages.updateDraft.v1", version: "1.0", executor: "other" },
        ],
      },
    ])
      expect(() =>
        parsePageArtifactCatalog({
          ...catalog(),
          definitions: [{ ...definition(), ...change }],
        }),
      ).toThrow();
  });

  it("ограничивает пути исходников, schema pointers, operation refs и инструкции", () => {
    for (const path of [
      "src/../secrets.ts",
      "/src/index.ts",
      "src/config/.env",
      "src/%2e%2e/config.ts",
      "https://example.test/guide.ts",
      "src\\index.ts",
    ]) {
      expect(() =>
        parsePageArtifactCatalog({
          ...catalog(),
          definitions: [
            { ...definition(), schema: { path, exportName: "Pages" } },
          ],
        }),
      ).toThrow();
    }
    for (const path of [
      "/__proto__/title",
      "/layout/../title",
      "/columns/constructor",
      "/prototype/title",
      "/columns/~1form",
    ]) {
      expect(() =>
        parsePageArtifactCatalog({
          ...catalog(),
          definitions: [
            {
              ...definition(),
              fields: [{ path, type: "text", required: false }],
            },
          ],
        }),
      ).toThrow();
    }
    for (const change of [
      { schema: { ...definition().schema, exportName: "x;process.exit()" } },
      { supportedOperations: [{ id: "../../write", version: "1.0" }] },
      {
        supportedOperations: [
          { id: "pages.updateDraft.v1", version: "latest" },
        ],
      },
      { guide: { ...definition().guide, instructions: ["a\u0000b"] } },
      { guide: { ...definition().guide, instructions: ["a".repeat(1_001)] } },
      { guide: { ...definition().guide, instructions: Array(9).fill("a") } },
      {
        fields: Array.from({ length: 65 }, (_, index) => ({
          path: `/field${index}`,
          type: "text",
          required: false,
        })),
      },
    ])
      expect(() =>
        parsePageArtifactCatalog({
          ...catalog(),
          definitions: [{ ...definition(), ...change }],
        }),
      ).toThrow();
  });

  it("не принимает дубли definitions, полей, связей и операций или лишнее описание порции", () => {
    expect(() =>
      parsePageArtifactCatalog({
        ...catalog(),
        definitions: [definition(), definition()],
      }),
    ).toThrow();
    expect(() =>
      parsePageArtifactCatalog({
        ...catalog(),
        definitions: [definition("blocks.content")],
      }),
    ).toThrow();
    for (const change of [
      { fields: [definition().fields[0], definition().fields[0]] },
      {
        fields: [
          {
            path: "/form",
            type: "relationship",
            required: true,
            relationTo: ["forms", "forms"],
          },
        ],
      },
      {
        supportedOperations: [
          definition().supportedOperations[0],
          definition().supportedOperations[0],
        ],
      },
    ])
      expect(() =>
        parsePageArtifactCatalog({
          ...catalog(),
          definitions: [{ ...definition(), ...change }],
        }),
      ).toThrow();
    expect(() =>
      parsePageKnowledge({ ...knowledge(), definitions: [definition()] }),
    ).toThrow();
    expect(() =>
      parsePageKnowledge({
        ...knowledge(),
        outline: {
          offset: 0,
          limit: 32,
          totalBlocks: 0,
          nextOffset: null,
          blocks: [],
        },
      }),
    ).toThrow();
  });

  it("принимает последовательную порцию и последнюю порцию одной ревизии без потери блоков", () => {
    const first = {
      ...knowledge(),
      definitions: [definition(), definition("blocks.content")],
      outline: {
        offset: 0,
        limit: 32,
        totalBlocks: 33,
        nextOffset: 32,
        blocks: Array.from({ length: 32 }, (_, index) => block(index)),
      },
    };
    const last = {
      ...first,
      outline: {
        offset: 32,
        limit: 32,
        totalBlocks: 33,
        nextOffset: null,
        blocks: [block(32)],
      },
    };
    expect(parsePageKnowledge(first)).toEqual(first);
    expect(parsePageKnowledge(last)).toEqual(last);
    for (const outline of [
      { ...first.outline, offset: -1 },
      { ...first.outline, offset: 0.5 },
      { ...first.outline, totalBlocks: 10_001 },
      { ...first.outline, limit: 64 },
      { ...first.outline, nextOffset: 31 },
      { ...first.outline, nextOffset: null },
      { ...first.outline, blocks: first.outline.blocks.slice(0, 31) },
      { ...last.outline, nextOffset: 33 },
      { ...last.outline, offset: 33, blocks: [] },
      { ...last.outline, blocks: [block(31)] },
      { ...last.outline, blocks: [{ ...block(32), path: "/layout/032" }] },
    ])
      expect(() => parsePageKnowledge({ ...first, outline })).toThrow();
  });

  it("различает реальные, отсутствующие и повторяющиеся IDs, включая повтор за пределами порции", () => {
    const missing = knowledge();
    missing.outline.blocks[0] = { ...block(), id: null, identity: "missing" };
    expect(parsePageKnowledge(missing)).toEqual(missing);
    const duplicate = knowledge();
    duplicate.outline.blocks = [
      { ...block(), id: "same", identity: "duplicate" },
      { ...block(1, "formBlock"), id: "same", identity: "duplicate" },
    ];
    expect(parsePageKnowledge(duplicate)).toEqual(duplicate);
    duplicate.outline.blocks[1].id = "other";
    expect(parsePageKnowledge(duplicate)).toEqual(duplicate);
    for (const change of [
      { id: null, identity: "stable" },
      { id: "ok", identity: "missing" },
      { id: "bad/id" },
      { identity: ["stable"] },
    ]) {
      expect(() =>
        parsePageKnowledge({
          ...knowledge(),
          outline: {
            ...knowledge().outline,
            blocks: [{ ...block(), ...change }, block(1, "formBlock")],
          },
        }),
      ).toThrow();
    }
    duplicate.outline.blocks[1] = {
      ...duplicate.outline.blocks[1],
      id: "same",
      identity: "stable",
    };
    expect(() => parsePageKnowledge(duplicate)).toThrow();
  });

  it("пропускает неизвестный тип без фиктивного definition и закрытых настроек", () => {
    const value = {
      ...knowledge(),
      definitions: [definition()],
      outline: {
        offset: 0,
        limit: 32 as const,
        totalBlocks: 1,
        nextOffset: null,
        blocks: [block(0, "mediaBlock")],
      },
    };
    expect(parsePageKnowledge(value)).toEqual(value);
    for (const change of [
      { definitionID: "blocks.content" },
      { settings: [{ path: "/media", value: "42" }] },
      { references: block(1, "formBlock").references },
    ]) {
      expect(() =>
        parsePageKnowledge({
          ...value,
          outline: {
            ...value.outline,
            blocks: [{ ...value.outline.blocks[0], ...change }],
          },
        }),
      ).toThrow();
    }
    for (const settings of [
      [{ path: "/__proto__/x", value: true }],
      [{ path: "/columns/count", value: { raw: true } }],
      [{ path: "/columns/count", value: -1 }],
      [
        { path: "/columns/count", value: 1 },
        { path: "/columns/count", value: 1 },
      ],
    ]) {
      const changed = knowledge();
      expect(() =>
        parsePageKnowledge({
          ...changed,
          outline: {
            ...changed.outline,
            blocks: [{ ...block(), settings }, block(1, "formBlock")],
          },
        }),
      ).toThrow();
    }
  });

  it("разрешает только завершённые ACL-проекции форм, скрывает id недоступной формы", () => {
    const value = knowledge();
    value.outline.blocks[1].references = [
      { field: "form", collection: "forms", id: null, access: "unavailable" },
    ];
    expect(parsePageKnowledge(value)).toEqual(value);
    for (const change of [
      { access: "unresolved" },
      { access: "readable", id: null },
      { access: "unavailable", id: "11" },
      { collection: "users" },
      { field: "emailTo" },
      { secret: "private" },
      { id: "bad/id" },
      { access: ["readable"] },
    ]) {
      const changed = knowledge();
      changed.outline.blocks[1] = {
        ...changed.outline.blocks[1],
        references: [{ ...block(1, "formBlock").references[0], ...change }],
      } as PageBlockOutlineDTO;
      expect(() => parsePageKnowledge(changed)).toThrow();
    }
  });

  it("сохраняет отдельный legacy лимит 128 полей и 64 KiB до enrichment", () => {
    const fields = Array.from({ length: 9 }, (_, index) => ({
      path: `/hero/richText/root/children/${index}/text`,
      label: "Фрагмент",
      value: "я".repeat(4_000),
      maxLength: 4_000,
    }));
    const enriched = knowledge();
    enriched.definitions[0].guide.instructions = Array(8).fill("я".repeat(900));
    const allowed = {
      ...textContext(),
      fields: fields.slice(0, 7),
      knowledge: enriched,
    };
    expect(
      new TextEncoder().encode(JSON.stringify(allowed)).byteLength,
    ).toBeGreaterThan(64 * 1024);
    expect(parsePageDraftContext(allowed)).toEqual(allowed);
    expect(() =>
      parsePageDraftContext({
        ...textContext(),
        fields,
        knowledge: knowledge(),
      }),
    ).toThrow(/64 KiB/);
    expect(() =>
      parsePageDraftContext({
        ...textContext(),
        fields: Array.from({ length: 129 }, (_, index) => ({
          ...fields[0],
          path: `/hero/richText/root/children/${index}/text`,
          value: "a",
        })),
        knowledge: knowledge(),
      }),
    ).toThrow(/128 fields/);
    expect(parsePageStructureContext(structure()).knowledge).toEqual(
      knowledge(),
    );
  });

  it("ограничивает каталог по UTF-8 32 KiB и knowledge по 48 KiB", () => {
    const definitions = [definition(), definition("blocks.formBlock")];
    for (const item of definitions)
      item.guide.instructions = Array(8).fill("я".repeat(950));
    const allowedCatalog = { version: "1.0", hash, definitions };
    expect(parsePageArtifactCatalog(allowedCatalog)).toEqual(allowedCatalog);
    const blocks = Array.from({ length: 32 }, (_, index) => {
      const result = block(index, "formBlock");
      result.id = `b${index}`.padEnd(128, "b");
      result.references[0].id = "f".repeat(128);
      return result;
    });
    expect(() =>
      parsePageKnowledge({
        ...knowledge(),
        definitions,
        outline: {
          offset: 0,
          limit: 32,
          totalBlocks: 32,
          nextOffset: null,
          blocks,
        },
      }),
    ).toThrow(/48 KiB/);
    const oversized = [...definitions, definition("blocks.content")];
    oversized[2].guide.instructions = Array(8).fill("я".repeat(900));
    expect(() =>
      parsePageArtifactCatalog({ ...allowedCatalog, definitions: oversized }),
    ).toThrow(/32 KiB/);
  });
});
