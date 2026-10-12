/**
 * @file tests/int/template-contracts.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет отказ небезопасных manifest и несовместимого назначения шаблона.
 */

import {
  parseTemplateManifest,
  resolveTemplateSelection,
  TemplateContractError,
  type TemplateContractErrorCode,
} from "@realize/template-contracts";
import { describe, expect, it } from "vitest";

function manifest() {
  return {
    schemaVersion: "1.0",
    id: "realize",
    version: "0.1.0",
    packageName: "@realize/template-realize",
    displayName: "Realize",
    entries: { admin: "./admin" },
    targets: [
      {
        target: "admin",
        screens: ["workspace", "auth", "status"],
        capabilities: ["search", "account"],
      },
    ],
    compatibility: {
      contractVersion: "1.0",
      platform: { minimum: "1.0.0", maximumExclusive: "2.0.0" },
      react: { minimum: "19.2.8", maximumExclusive: "20.0.0" },
      next: { minimum: "16.3.1", maximumExclusive: "17.0.0" },
    },
    settings: {
      schemaVersion: "1.0.0",
      schemaPath: "settings.schema.json",
      defaults: { density: "comfortable", branding: { title: "Realize" } },
    },
    palettes: [
      {
        id: "default",
        version: "1.0.0",
        label: "Realize",
        modes: ["light", "dark"],
      },
    ],
    ui: { contractVersion: "1.0", primitives: ["Button", "Input"] },
  };
}

function selection() {
  return {
    templateId: "realize",
    templateVersion: "0.1.0",
    target: "admin",
    paletteId: "default",
    paletteVersion: "1.0.0",
    mode: "light",
  };
}

function host() {
  return {
    contractVersion: "1.0",
    platformVersion: "1.0.0",
    reactVersion: "19.2.8",
    nextVersion: "16.3.1",
  };
}

function expectCode(operation: () => unknown, code: TemplateContractErrorCode) {
  expect(operation).toThrowError(TemplateContractError);
  try {
    operation();
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe("template package manifest", () => {
  it("accepts an Admin-only package and a separate frontend target in the same protocol", () => {
    const admin = parseTemplateManifest(manifest());
    expect(admin.targets[0].target).toBe("admin");
    const frontend = {
      ...manifest(),
      entries: { frontend: "./frontend" },
      targets: [{ target: "frontend", screens: ["page"] }],
    };
    expect(parseTemplateManifest(frontend).targets[0].target).toBe("frontend");
  });

  it.each([
    ["root extra key", { ...manifest(), execute: "npm install" }],
    [
      "nested extra key",
      { ...manifest(), entries: { admin: "./admin", shell: "/bin/sh" } },
    ],
    ["invalid ID", { ...manifest(), id: "../realize" }],
    ["mutable version", { ...manifest(), version: "latest" }],
    ["prerelease", { ...manifest(), version: "0.1.0-beta.1" }],
    ["build metadata", { ...manifest(), version: "0.1.0+build.1" }],
    ["leading zero", { ...manifest(), version: "01.0.0" }],
    ["unsafe integer", { ...manifest(), version: "9007199254740992.0.0" }],
    [
      "filesystem entry",
      { ...manifest(), entries: { admin: "./src/../admin" } },
    ],
    [
      "remote entry",
      { ...manifest(), entries: { admin: "https://example.test/admin.js" } },
    ],
    [
      "undeclared target",
      { ...manifest(), entries: { admin: "./admin", frontend: "./frontend" } },
    ],
    ["missing entry", { ...manifest(), entries: {} }],
    [
      "repeated target",
      {
        ...manifest(),
        targets: [...manifest().targets, ...manifest().targets],
      },
    ],
    [
      "wrong screen",
      { ...manifest(), targets: [{ target: "admin", screens: ["page"] }] },
    ],
    [
      "unknown capability",
      {
        ...manifest(),
        targets: [
          {
            target: "admin",
            screens: ["workspace"],
            capabilities: ["database"],
          },
        ],
      },
    ],
    [
      "settings traversal",
      {
        ...manifest(),
        settings: {
          ...manifest().settings,
          schemaPath: "../settings.schema.json",
        },
      },
    ],
    [
      "settings absolute path",
      {
        ...manifest(),
        settings: {
          ...manifest().settings,
          schemaPath: "/settings.schema.json",
        },
      },
    ],
    [
      "settings remote path",
      {
        ...manifest(),
        settings: {
          ...manifest().settings,
          schemaPath: "https://example.test/settings.json",
        },
      },
    ],
    [
      "repeated palette",
      {
        ...manifest(),
        palettes: [...manifest().palettes, ...manifest().palettes],
      },
    ],
    [
      "unsupported mode",
      {
        ...manifest(),
        palettes: [{ ...manifest().palettes[0], modes: ["system"] }],
      },
    ],
    [
      "missing primitive",
      { ...manifest(), ui: { contractVersion: "1.0", primitives: ["Button"] } },
    ],
    [
      "empty range",
      {
        ...manifest(),
        compatibility: {
          ...manifest().compatibility,
          platform: { minimum: "2.0.0", maximumExclusive: "2.0.0" },
        },
      },
    ],
  ])("rejects %s", (_name, input) => {
    expectCode(() => parseTemplateManifest(input), "INVALID_MANIFEST");
  });

  it("accepts partial primitive supply only with explicit default inheritance", () => {
    expect(
      parseTemplateManifest({
        ...manifest(),
        ui: {
          contractVersion: "1.0",
          primitives: ["Button"],
          inheritsDefault: true,
        },
      }).ui.inheritsDefault,
    ).toBe(true);
    expect(
      parseTemplateManifest({
        ...manifest(),
        ui: { contractVersion: "1.0", primitives: [], inheritsDefault: true },
      }).ui.inheritsDefault,
    ).toBe(true);
  });

  it.each([
    new Date(),
    { value: undefined },
    { value: Number.NaN },
    { value: Number.POSITIVE_INFINITY },
    { value: () => true },
    JSON.parse('{"__proto__":{"polluted":true}}'),
  ])("rejects non-JSON settings %#", (defaults) => {
    expectCode(
      () =>
        parseTemplateManifest({
          ...manifest(),
          settings: { ...manifest().settings, defaults },
        }),
      "INVALID_MANIFEST",
    );
  });

  it("rejects cycles/getters without evaluating them or overflowing the parser", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expectCode(
      () =>
        parseTemplateManifest({
          ...manifest(),
          settings: { ...manifest().settings, defaults: cyclic },
        }),
      "INVALID_MANIFEST",
    );
    let accessed = false;
    const defaults = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => {
        accessed = true;
        return "secret";
      },
    });
    expectCode(
      () =>
        parseTemplateManifest({
          ...manifest(),
          settings: { ...manifest().settings, defaults },
        }),
      "INVALID_MANIFEST",
    );
    expect(accessed).toBe(false);
  });
});

describe("known compatible template selection", () => {
  it("selects exact template/palette identity and supported mode", () => {
    const result = resolveTemplateSelection({
      manifests: [manifest()],
      selection: selection(),
      host: { ...host(), requiredCapabilities: ["account"] },
    });
    expect(result.manifest.version).toBe("0.1.0");
    expect(result.palette.version).toBe("1.0.0");
    expect(result.selection.mode).toBe("light");
  });

  it.each([
    [{ ...selection(), templateVersion: "0.2.0" }, "UNKNOWN_TEMPLATE"],
    [{ ...selection(), paletteVersion: "2.0.0" }, "UNKNOWN_PALETTE"],
    [{ ...selection(), target: "frontend" }, "UNSUPPORTED_TARGET"],
    [{ ...selection(), mode: "system" }, "INVALID_SELECTION"],
    [{ ...selection(), extra: true }, "INVALID_SELECTION"],
  ] as const)("rejects unavailable selection %#", (selected, code) => {
    expectCode(
      () =>
        resolveTemplateSelection({
          manifests: [manifest()],
          selection: selected,
          host: host(),
        }),
      code,
    );
  });

  it("uses an inclusive minimum and exclusive maximum instead of lexical ordering", () => {
    for (const reactVersion of ["19.2.7", "20.0.0"]) {
      expectCode(
        () =>
          resolveTemplateSelection({
            manifests: [manifest()],
            selection: selection(),
            host: { ...host(), reactVersion },
          }),
        "INCOMPATIBLE_HOST",
      );
    }
    expect(
      resolveTemplateSelection({
        manifests: [manifest()],
        selection: selection(),
        host: { ...host(), reactVersion: "19.10.0" },
      }).manifest.id,
    ).toBe("realize");
  });

  it("rejects unavailable capabilities, mode and ambiguous registry versions", () => {
    expectCode(
      () =>
        resolveTemplateSelection({
          manifests: [manifest()],
          selection: selection(),
          host: { ...host(), requiredCapabilities: ["assistant"] },
        }),
      "MISSING_CAPABILITY",
    );
    const lightOnly = {
      ...manifest(),
      palettes: [{ ...manifest().palettes[0], modes: ["light"] }],
    };
    expectCode(
      () =>
        resolveTemplateSelection({
          manifests: [lightOnly],
          selection: { ...selection(), mode: "dark" },
          host: host(),
        }),
      "UNSUPPORTED_MODE",
    );
    expectCode(
      () =>
        resolveTemplateSelection({
          manifests: [manifest(), manifest()],
          selection: selection(),
          host: host(),
        }),
      "DUPLICATE_TEMPLATE",
    );
    expectCode(
      () =>
        resolveTemplateSelection({
          manifests: [manifest()],
          selection: selection(),
          host: { ...host(), reactVersion: "19.3.0-rc.1" },
        }),
      "INVALID_HOST",
    );
  });
});
