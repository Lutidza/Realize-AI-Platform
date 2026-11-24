// @vitest-environment node
/**
 * @file tests/int/template-layout-contracts.int.spec.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Проверяет строгие определения макетов, точные ссылки каталога, slots и hash-bound snapshot SDK.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { describe, expect, it } from "vitest";
import {
  assertLayoutSlots,
  parseLayoutDescriptor,
  parseTemplateLayoutCatalog,
  resolveTemplateLayout,
} from "@realize/template-contracts";
import { createTemplateLayoutCatalog } from "@realize/template-contracts/layouts/server";

const identity = (id: string) => ({ namespace: "example", id });
const templateIdentity = identity("control-panel");

function descriptor(localId = "default") {
  const keys = ["rail", "sidebar", "panel-content", "footer"];
  if (localId === "default") keys.splice(1, 0, "topbar");
  return {
    schemaVersion: "1.0",
    identity: identity(`control-panel.layout-${localId}`),
    kind: "layout",
    version: "0.1.0",
    title: localId === "default" ? "Стандартный" : "Без верхней панели",
    description: "Контрольное определение каркаса без содержимого областей.",
    owner: { identity: identity("package.control-panel") },
    template: { ...templateIdentity },
    target: "admin",
    screen: "workspace",
    profile: { id: "realize.admin-panel-frame", version: "0.1.0" },
    regions: keys.map((key) => ({
      key,
      emptyBehavior: "preserve",
      slots: key === "rail" ? ["brand", "rail"] : [key],
    })),
    guides: [
      { purpose: "usage", path: "README.md", anchor: "layouts" },
      {
        purpose: "development",
        path: "README.md",
        anchor: "layout-development",
      },
    ],
  };
}

function catalogInput() {
  const descriptors = [descriptor(), descriptor("without-topbar")];
  return {
    template: { identity: { ...templateIdentity }, version: "0.1.0" },
    defaultLayoutId: "default",
    aliases: ["default", "without-topbar"].map((localId, index) => ({
      localId,
      layout: {
        identity: { ...descriptors[index].identity },
        version: descriptors[index].version,
      },
    })),
    descriptors,
  };
}

function expectCode(action: () => unknown, code: string) {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

describe("Строгий layout descriptor", () => {
  it("различает пять областей default и четыре области without-topbar", () => {
    const standard = parseLayoutDescriptor(descriptor());
    const withoutTopbar = parseLayoutDescriptor(descriptor("without-topbar"));
    expect(standard.regions.map((region) => region.key)).toEqual([
      "rail",
      "topbar",
      "sidebar",
      "panel-content",
      "footer",
    ]);
    expect(withoutTopbar.regions.map((region) => region.key)).toEqual([
      "rail",
      "sidebar",
      "panel-content",
      "footer",
    ]);
    expect(standard.owner).toEqual({
      identity: identity("package.control-panel"),
    });
    expect(standard.version).toBe("0.1.0");
    expect(standard.template).toEqual(templateIdentity);
    for (const item of [standard, withoutTopbar])
      expect(
        item.regions.every((region) => region.emptyBehavior === "preserve"),
      ).toBe(true);
  });

  it.each(["latest", "*", "^0.1.0", "0.1", "0.1.0 || 0.2.0"])(
    "не принимает неполную или неточную definition version %s",
    (version) => {
      expectCode(
        () => parseLayoutDescriptor({ ...descriptor(), version }),
        "INVALID_DESCRIPTOR",
      );
    },
  );

  it.each([
    ["чужой kind", { kind: "component" }],
    ["frontend target", { target: "frontend" }],
    ["неподдержанный screen", { screen: "auth" }],
    ["CSS-команда", { css: "display:none" }],
    ["выполняемая привязка", { renderer: () => null }],
    ["claim готовности", { ready: true }],
    [
      "kind внутри owner",
      {
        owner: { identity: identity("package.control-panel"), kind: "package" },
      },
    ],
    [
      "неизвестный profile",
      { profile: { id: "arbitrary.frame", version: "0.1.0" } },
    ],
    [
      "неподдержанная версия profile",
      { profile: { id: "realize.admin-panel-frame", version: "9.0.0" } },
    ],
  ])("отклоняет расширение вне контракта: %s", (_name, patch) => {
    expectCode(
      () => parseLayoutDescriptor({ ...descriptor(), ...patch }),
      "INVALID_DESCRIPTOR",
    );
  });

  it.each(["rail", "sidebar", "panel-content", "footer"])(
    "не допускает исчезновение обязательной области %s",
    (key) => {
      const input = descriptor();
      input.regions = input.regions.filter((region) => region.key !== key);
      expectCode(() => parseLayoutDescriptor(input), "INVALID_DESCRIPTOR");
    },
  );

  it("отклоняет дубликат, произвольную область и collapse пустой области", () => {
    const duplicate = descriptor();
    duplicate.regions.push(structuredClone(duplicate.regions[0]));
    expectCode(() => parseLayoutDescriptor(duplicate), "INVALID_DESCRIPTOR");
    const arbitrary = descriptor();
    arbitrary.regions.push({
      key: "workspace",
      emptyBehavior: "preserve",
      slots: ["workspace"],
    });
    expectCode(() => parseLayoutDescriptor(arbitrary), "INVALID_DESCRIPTOR");
    const collapse = descriptor();
    collapse.regions[0].emptyBehavior = "collapse";
    expectCode(() => parseLayoutDescriptor(collapse), "INVALID_DESCRIPTOR");
  });

  it("не разрешает прятать topbar slot в чужой области", () => {
    const input = descriptor("without-topbar");
    input.regions[0].slots.push("topbar");
    expectCode(() => parseLayoutDescriptor(input), "INVALID_DESCRIPTOR");
    const duplicateSlot = descriptor();
    duplicateSlot.regions[0].slots.push("brand");
    expectCode(
      () => parseLayoutDescriptor(duplicateSlot),
      "INVALID_DESCRIPTOR",
    );
  });

  it.each([
    "../README.md",
    "/README.md",
    "https://example.com/guide.md",
    "**/*.md",
  ])("отклоняет guide source вне безопасной ссылки пакета: %s", (path) => {
    const input = descriptor();
    input.guides[0].path = path;
    expectCode(() => parseLayoutDescriptor(input), "INVALID_DESCRIPTOR");
  });

  it("проверяет purpose и отдельный anchor без URL-fragment prefix", () => {
    const purpose = descriptor();
    purpose.guides[0].purpose = "system-instruction";
    expectCode(() => parseLayoutDescriptor(purpose), "INVALID_DESCRIPTOR");
    const anchor = descriptor();
    anchor.guides[0].anchor = "#layouts";
    expectCode(() => parseLayoutDescriptor(anchor), "INVALID_DESCRIPTOR");
  });

  it("допускает пустое наполнение, но отклоняет неизвестные и отсутствующие slots", () => {
    expect(() => assertLayoutSlots(descriptor(), [])).not.toThrow();
    expect(() =>
      assertLayoutSlots(descriptor(), [
        "brand",
        "rail",
        "topbar",
        "sidebar",
        "panel-content",
        "footer",
      ]),
    ).not.toThrow();
    expect(() =>
      assertLayoutSlots(descriptor("without-topbar"), [
        "brand",
        "panel-content",
      ]),
    ).not.toThrow();
    expectCode(
      () => assertLayoutSlots(descriptor("without-topbar"), ["topbar"]),
      "UNSUPPORTED_SLOT",
    );
    expectCode(
      () => assertLayoutSlots(descriptor(), ["body"]),
      "UNSUPPORTED_SLOT",
    );
    expect(() => assertLayoutSlots(descriptor(), ["*"])).toThrow();
    expectCode(
      () => assertLayoutSlots(descriptor(), ["rail", "rail"]),
      "INVALID_SLOT_KEYS",
    );
  });
});

describe("Точные ссылки и aliases каталога макетов", () => {
  it("разрешает default и явный local ID в самостоятельную definition version", () => {
    const input = catalogInput();
    input.template.version = "0.2.0";
    const catalog = createTemplateLayoutCatalog(input);
    const inherited = resolveTemplateLayout(catalog);
    expect(inherited.localId).toBe("default");
    expect(inherited.reference).toEqual(input.aliases[0].layout);
    expect(inherited.descriptor.version).toBe("0.1.0");
    expect(catalog.template.version).toBe("0.2.0");
    expect(resolveTemplateLayout(catalog, "without-topbar").reference).toEqual(
      input.aliases[1].layout,
    );
  });

  it("сохраняет различие наследования и явного default при смене default selector", () => {
    const input = catalogInput();
    input.defaultLayoutId = "without-topbar";
    const catalog = createTemplateLayoutCatalog(input);
    expect(resolveTemplateLayout(catalog).localId).toBe("without-topbar");
    expect(resolveTemplateLayout(catalog, "default").localId).toBe("default");
    expectCode(
      () => resolveTemplateLayout(catalog, "missing"),
      "UNKNOWN_LAYOUT",
    );
    expect(() => resolveTemplateLayout(catalog, "")).toThrow();
  });

  it("допускает явный дополнительный alias того же exact definition", () => {
    const input = catalogInput();
    input.aliases.push({
      localId: "standard-alias",
      layout: structuredClone(input.aliases[0].layout),
    });
    const catalog = createTemplateLayoutCatalog(input);
    expect(resolveTemplateLayout(catalog, "standard-alias").reference).toEqual(
      resolveTemplateLayout(catalog, "default").reference,
    );
  });

  it("отклоняет неверный parent template и непопавший в descriptors pin", () => {
    const parent = catalogInput();
    parent.descriptors[1].template = identity("another-template");
    expectCode(() => createTemplateLayoutCatalog(parent), "TEMPLATE_MISMATCH");
    const version = catalogInput();
    version.aliases[0].layout.version = "0.1.1";
    expectCode(
      () => createTemplateLayoutCatalog(version),
      "UNKNOWN_LAYOUT_REFERENCE",
    );
    const unknown = catalogInput();
    unknown.aliases[0].layout.identity = identity("layout.unknown");
    expectCode(
      () => createTemplateLayoutCatalog(unknown),
      "UNKNOWN_LAYOUT_REFERENCE",
    );
  });

  it.each(["latest", "*", "^0.1.0", "0.1"])(
    "отклоняет неточный pin %s вместо exact version",
    (version) => {
      const layoutPin = catalogInput();
      layoutPin.aliases[0].layout.version = version;
      expectCode(
        () => createTemplateLayoutCatalog(layoutPin),
        "INVALID_CATALOG",
      );
      const templatePin = catalogInput();
      templatePin.template.version = version;
      expectCode(
        () => createTemplateLayoutCatalog(templatePin),
        "INVALID_CATALOG",
      );
    },
  );

  it("отклоняет дубликаты definitions/aliases и отсутствие default", () => {
    const descriptors = catalogInput();
    descriptors.descriptors.push(structuredClone(descriptors.descriptors[0]));
    expectCode(
      () => createTemplateLayoutCatalog(descriptors),
      "DUPLICATE_DESCRIPTOR",
    );
    const aliases = catalogInput();
    aliases.aliases.push({ ...aliases.aliases[1], localId: "default" });
    expectCode(() => createTemplateLayoutCatalog(aliases), "DUPLICATE_ALIAS");
    const missingDefault = catalogInput();
    missingDefault.defaultLayoutId = "missing";
    expectCode(
      () => createTemplateLayoutCatalog(missingDefault),
      "UNKNOWN_DEFAULT_LAYOUT",
    );
  });

  it("проверяет полное покрытие descriptors и не принимает произвольные aliases/CSS", () => {
    const unused = catalogInput();
    const extra = descriptor();
    extra.identity = identity("layout.unreferenced");
    unused.descriptors.push(extra);
    expectCode(
      () => createTemplateLayoutCatalog(unused),
      "UNREFERENCED_DESCRIPTOR",
    );
    const wildcard = catalogInput();
    wildcard.aliases[0].localId = "*";
    expectCode(() => createTemplateLayoutCatalog(wildcard), "INVALID_CATALOG");
    expectCode(
      () =>
        createTemplateLayoutCatalog({ ...catalogInput(), css: "grid:none" }),
      "INVALID_CATALOG",
    );
  });
});

describe("Catalog hash, источник и неизменяемый snapshot", () => {
  it("канонизирует порядок aliases/descriptors, сохраняя authored порядок областей и guides", () => {
    const input = catalogInput();
    const reordered = structuredClone(input);
    reordered.aliases.reverse();
    reordered.descriptors.reverse();
    const baseline = createTemplateLayoutCatalog(input);
    expect(createTemplateLayoutCatalog(reordered)).toEqual(baseline);
    const changedOrder = catalogInput();
    changedOrder.descriptors[0].regions.reverse();
    changedOrder.descriptors[0].guides.reverse();
    const changed = createTemplateLayoutCatalog(changedOrder);
    expect(changed.catalogHash).not.toBe(baseline.catalogHash);
    const selected = resolveTemplateLayout(changed, "default").descriptor;
    expect(selected.regions.map((region) => region.key)).toEqual(
      changedOrder.descriptors[0].regions.map((region) => region.key),
    );
    expect(selected.guides).toEqual(changedOrder.descriptors[0].guides);
  });

  it("различает browser format validation, claimed hash и независимый stale guard", () => {
    const input = catalogInput();
    const accepted = createTemplateLayoutCatalog(input);
    expect(accepted.catalogHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parseTemplateLayoutCatalog(input).descriptors).toHaveLength(2);
    const forged = { ...input, catalogHash: "0".repeat(64) };
    expect(parseTemplateLayoutCatalog(forged).catalogHash).toBe("0".repeat(64));
    expectCode(() => createTemplateLayoutCatalog(forged), "HASH_MISMATCH");
    expectCode(
      () => parseTemplateLayoutCatalog({ ...input, catalogHash: "not-a-hash" }),
      "INVALID_CATALOG",
    );
    const changed = catalogInput();
    changed.descriptors[0].description =
      "Другое точное содержимое определения.";
    expect(createTemplateLayoutCatalog(changed).catalogHash).not.toBe(
      accepted.catalogHash,
    );
    expectCode(
      () => createTemplateLayoutCatalog(changed, accepted.catalogHash),
      "STALE_CATALOG",
    );
    expect(
      createTemplateLayoutCatalog(structuredClone(input), accepted.catalogHash),
    ).toEqual(accepted);
  });

  it("не подменяет прежний pin новой согласованной парой alias/definition", () => {
    const input = catalogInput();
    const prior = createTemplateLayoutCatalog(input);
    const candidate = catalogInput();
    candidate.descriptors[0].version = "0.1.1";
    candidate.aliases[0].layout.version = "0.1.1";
    const fresh = createTemplateLayoutCatalog(candidate);
    expect(resolveTemplateLayout(fresh, "default").reference.version).toBe(
      "0.1.1",
    );
    expectCode(
      () => createTemplateLayoutCatalog(candidate, prior.catalogHash),
      "STALE_CATALOG",
    );
  });

  it("отделяет входные объекты и глубоко замораживает каталоги и результат lookup", () => {
    const input = catalogInput();
    const snapshot = createTemplateLayoutCatalog(input);
    const expected = structuredClone(snapshot);
    input.template.identity.id = "another-template";
    input.aliases[0].layout.version = "9.0.0";
    input.descriptors[0].owner.identity.id = "another-owner";
    input.descriptors[0].regions[0].slots.push("topbar");
    input.descriptors[0].guides[0].path = "changed.md";
    expect(snapshot).toEqual(expected);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.aliases[0].layout.identity)).toBe(true);
    const resolved = resolveTemplateLayout(snapshot, "default");
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.reference)).toBe(true);
    expect(Object.isFrozen(resolved.descriptor.regions[0].slots)).toBe(true);
    expect(Object.isFrozen(resolved.descriptor.guides[0])).toBe(true);
    expect(Reflect.set(resolved.descriptor, "title", "Подмена")).toBe(false);
    expect(snapshot).toEqual(expected);
  });
});
