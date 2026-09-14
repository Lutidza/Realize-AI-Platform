// @vitest-environment node
/**
 * @file tests/int/pageKnowledgeHost.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет проекцию реальной схемы и безопасные границы структуры страниц.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePageArtifactCatalog } from "@realize/ai-contracts";
import { Pages } from "../../src/collections/Pages";
import { pageKnowledgeAdapter } from "../../src/collections/Pages/pageKnowledge.adapter";
import type { Field } from "payload";

const schemaCopy = (): Field[] => JSON.parse(JSON.stringify(Pages.fields));

describe("Pages knowledge host registration", () => {
  it("derives summaries from real Pages and block fields without serializing config", () => {
    const definitions = pageKnowledgeAdapter.definitions(Pages.fields);
    expect(
      parsePageArtifactCatalog({
        version: "1.0",
        hash: "a".repeat(64),
        definitions,
      }).definitions,
    ).toEqual(definitions);
    expect(definitions.map(({ id }) => id)).toEqual([
      "pages",
      "blocks.content",
      "blocks.formBlock",
    ]);
    expect(
      definitions[0].fields.find(({ path }) => path === "/layout"),
    ).toMatchObject({ type: "blocks", required: true });
    expect(
      definitions[1].fields.find(({ path }) => path === "/columns/*/richText"),
    ).toMatchObject({ type: "richText", required: false });
    expect(definitions[2].fields.find(({ path }) => path === "/form")).toEqual({
      path: "/form",
      type: "relationship",
      required: true,
      relationTo: ["forms"],
    });
    expect(definitions[2].supportedOperations).toEqual([]);
    for (const definition of definitions) {
      for (const field of definition.fields) {
        expect(
          Object.keys(field).every((key) =>
            ["path", "type", "required", "relationTo"].includes(key),
          ),
        ).toBe(true);
      }
      expect(readFileSync(definition.schema.path, "utf8")).toContain(
        definition.schema.exportName,
      );
      expect(readFileSync(definition.renderer.path, "utf8")).toContain(
        definition.renderer.exportName,
      );
      expect(readFileSync(definition.guide.source, "utf8")).toContain(
        definition.guide.instructions[0],
      );
    }
  });

  it("reads installation changes to required instead of keeping a copied schema", () => {
    const fields = schemaCopy();
    const title = fields.find(
      (field) => "name" in field && field.name === "title",
    );
    if (!title || title.type !== "text")
      throw new Error("Missing fixture title");
    title.required = false;
    expect(
      pageKnowledgeAdapter
        .definitions(fields)[0]
        .fields.find(({ path }) => path === "/title")?.required,
    ).toBe(false);
  });

  it("rejects missing or incompatible schema fields", () => {
    const fields = schemaCopy();
    expect(() =>
      pageKnowledgeAdapter.definitions(
        fields.filter((field) => !("name" in field && field.name === "title")),
      ),
    ).toThrow(/несовместима/);
    expect(() =>
      pageKnowledgeAdapter.definitions([
        { name: "title", type: "textarea" },
        ...fields.filter(
          (field) => !("name" in field && field.name === "title"),
        ),
      ]),
    ).toThrow(/несовместима/);
  });

  it("rejects removed block registration and changed shared relationship owner", () => {
    const removed = schemaCopy();
    const changed = schemaCopy();
    for (const fields of [removed, changed]) {
      const tabs = fields.find((field) => field.type === "tabs");
      if (!tabs || tabs.type !== "tabs")
        throw new Error("Missing fixture tabs");
      const layout = tabs.tabs
        .flatMap((tab) => tab.fields)
        .find((field) => field.type === "blocks");
      if (!layout || layout.type !== "blocks")
        throw new Error("Missing fixture layout");
      if (fields === removed) {
        layout.blocks = layout.blocks.filter(
          (block) => block.slug !== "formBlock",
        );
      } else {
        const form = layout.blocks
          .find((block) => block.slug === "formBlock")
          ?.fields.find((field) => "name" in field && field.name === "form");
        if (!form || form.type !== "relationship")
          throw new Error("Missing fixture form");
        form.relationTo = "pages";
      }
    }
    expect(() => pageKnowledgeAdapter.definitions(removed)).toThrow(
      /не зарегистрирован/,
    );
    expect(() => pageKnowledgeAdapter.definitions(changed)).toThrow(
      /коллекцию forms/,
    );
  });

  it("isolates manifest values between requests", () => {
    const first = pageKnowledgeAdapter.definitions(Pages.fields);
    first[0].guide.instructions[0] = "tampered";
    first[0].supportedOperations.length = 0;
    expect(pageKnowledgeAdapter.definitions(Pages.fields)[0]).not.toEqual(
      first[0],
    );
  });
});

describe("Pages knowledge outline", () => {
  it("preserves placement identity and order while excluding content and populated form data", () => {
    const page = {
      layout: [
        {
          id: "content-1",
          blockType: "content",
          blockName: "PRIVATE NAME",
          columns: [{ richText: { secret: "PRIVATE TEXT" } }],
        },
        {
          id: "form-1",
          blockType: "formBlock",
          enableIntro: true,
          introContent: { secret: "PRIVATE INTRO" },
          form: { id: 19, title: "PRIVATE FORM", emails: ["PRIVATE EMAIL"] },
        },
        {
          id: "media-1",
          blockType: "mediaBlock",
          media: { url: "PRIVATE MEDIA" },
        },
      ],
    };
    const snapshot = structuredClone(page);
    const result = pageKnowledgeAdapter.outline(page, 0);
    expect(
      result.blocks.map(({ id, index, path }) => ({ id, index, path })),
    ).toEqual([
      { id: "content-1", index: 0, path: "/layout/0" },
      { id: "form-1", index: 1, path: "/layout/1" },
      { id: "media-1", index: 2, path: "/layout/2" },
    ]);
    expect(result.blocks[0].settings).toEqual([
      { path: "/columns/count", value: 1 },
    ]);
    expect(result.blocks[1].references).toEqual([
      { field: "form", collection: "forms", id: "19", access: "unresolved" },
    ]);
    expect(result.blocks[2]).toMatchObject({
      definitionID: null,
      settings: [],
      references: [],
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(page).toEqual(snapshot);
  });

  it("detects duplicate placement IDs across chunks without inventing missing IDs", () => {
    const layout = Array.from({ length: 40 }, (_, index) => ({
      id: `block-${index}`,
      blockType: "content",
    }));
    layout[39].id = layout[0].id;
    layout[1].id = "";
    const first = pageKnowledgeAdapter.outline({ layout }, 0);
    const last = pageKnowledgeAdapter.outline({ layout }, 32);
    expect(first).toMatchObject({ totalBlocks: 40, nextOffset: 32, limit: 32 });
    expect(first.blocks).toHaveLength(32);
    expect(first.blocks[0]).toMatchObject({
      identity: "duplicate",
      id: "block-0",
    });
    expect(first.blocks[1]).toMatchObject({ identity: "missing", id: null });
    expect(last.blocks[7]).toMatchObject({
      identity: "duplicate",
      index: 39,
      id: "block-0",
    });
    expect(last.nextOffset).toBeNull();
  });

  it("reads structure independently of legacy text limits", () => {
    const columns = Array.from({ length: 500 }, () => ({
      richText: "x".repeat(5000),
    }));
    expect(
      pageKnowledgeAdapter.outline(
        { layout: [{ blockType: "content", columns }] },
        0,
      ).blocks[0].settings,
    ).toEqual([{ path: "/columns/count", value: 500 }]);
  });

  it.each([-1, 1, 1.5, 64, Number.NaN])(
    "rejects invalid chunk offset %s",
    (offset) => {
      expect(() =>
        pageKnowledgeAdapter.outline(
          {
            layout: Array.from({ length: 40 }, () => ({
              blockType: "content",
            })),
          },
          offset,
        ),
      ).toThrow(/порция/);
    },
  );

  it("rejects oversized or malformed layouts and avoids expanding unsafe references", () => {
    expect(() =>
      pageKnowledgeAdapter.outline({ layout: Array(10001) }, 0),
    ).toThrow(/границы/);
    expect(() => pageKnowledgeAdapter.outline({ layout: [{}] }, 0)).toThrow(
      /тип блока/,
    );
    expect(() =>
      pageKnowledgeAdapter.outline(
        { layout: [{ blockType: "content", columns: Array(10001) }] },
        0,
      ),
    ).toThrow(/колонок/);
    const result = pageKnowledgeAdapter.outline(
      {
        layout: [
          {
            blockType: "formBlock",
            id: "bad/id",
            form: { id: "bad/id", email: "PRIVATE" },
          },
        ],
      },
      0,
    );
    expect(result.blocks[0]).toMatchObject({
      id: null,
      identity: "missing",
      references: [{ id: null, access: "unresolved" }],
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
});
