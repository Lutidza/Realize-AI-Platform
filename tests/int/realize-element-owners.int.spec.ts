// @vitest-environment node
/**
 * @file tests/int/realize-element-owners.int.spec.ts
 * @version 1.0.3
 * @date 2026-11-22
 * @description Проверяет реальные owner registrations и native mappings элементов host.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { resolveElementOwner } from "@realize/element-registry/server";
import { getElementIdentityKey } from "@realize/element-registry";
import {
  assertLayoutSlots,
  resolveTemplateLayout,
} from "@realize/template-contracts";
import {
  controlPanelManifest,
  CONTROL_PANEL_LAYOUT_IDS,
} from "@realize/template-realizeai-control-panel/manifest";
import { controlPanelPackageOwnerRegistration } from "@realize/template-realizeai-control-panel/registry";
import { controlPanelLayoutCatalog } from "@realize/template-realizeai-control-panel/layouts";
import controlPanelPackage from "@realize/template-realizeai-control-panel/package.json";
import { resolveControlPanelSettings } from "@realize/template-realizeai-control-panel/settings";
import { realizeOwnerRegistry } from "../../src/registry/realizeOwnerRegistry.config";
import { realizeElementOwnerBindings } from "../../src/registry/realizeElementOwnerBindings.config";
import { pageAgentManifest } from "../../src/collections/Pages/pageAgent.manifest";
import { extensionTemplateCatalog } from "../../src/plugins/extensionTemplateCatalog.config";
import { documentListScreenManifest } from "../../src/components/admin/documents/documentListScreen.manifest";
import { documentListScreenRegistration } from "../../src/components/admin/documents/documentListScreen.registry.config";
import { documentReadingScreenManifest } from "../../src/components/admin/documents/documentReadingScreen.manifest";
import { documentReadingScreenRegistration } from "../../src/components/admin/documents/documentReadingScreen.registry.config";
import hostPackage from "../../package.json";

const readSource = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Явные владельцы элементов Realize", () => {
  it("строит две регистрации и один binding из реальных server-safe exports", () => {
    expect(realizeOwnerRegistry.registrations).toHaveLength(2);
    expect(realizeOwnerRegistry.packageBindings).toHaveLength(1);
    expect(realizeOwnerRegistry.rootProject).toEqual({
      namespace: "realize",
      id: "project.realize-ai-platform",
    });
    const binding = realizeOwnerRegistry.packageBindings[0];
    expect(binding.identity).toEqual(
      controlPanelPackageOwnerRegistration.identity,
    );
    expect(binding.packageName).toBe(controlPanelPackage.name);
    expect(binding.packageVersion).toBe(
      hostPackage.dependencies["@realize/template-realizeai-control-panel"],
    );
    expect(binding.packageVersion).toBe(controlPanelPackage.version);
    expect(binding.requiredExports).toContain("./layouts");
    expect(binding.exports).toEqual(
      Object.fromEntries(
        binding.requiredExports.map((name) => [
          name,
          controlPanelPackage.exports[
            name as keyof typeof controlPanelPackage.exports
          ],
        ]),
      ),
    );
    expect(realizeOwnerRegistry.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("разрешает Pages и компоненты к проекту, а template/palette/layouts к пакету", () => {
    expect(realizeElementOwnerBindings).toHaveLength(7);
    expect(
      new Set(
        realizeElementOwnerBindings.map((item) =>
          getElementIdentityKey(item.identity),
        ),
      ).size,
    ).toBe(7);
    for (const item of realizeElementOwnerBindings) {
      const owner = resolveElementOwner(realizeOwnerRegistry, item.owner);
      expect(owner.kind).toBe(
        ["collection", "component"].includes(item.kind) ? "project" : "package",
      );
      expect(owner.rootProject).toEqual(realizeOwnerRegistry.rootProject);
      expect(owner.snapshotHash).toBe(realizeOwnerRegistry.snapshotHash);
      expect(item.owner).not.toHaveProperty("kind");
    }
  });

  it.each([
    {
      id: "document-reading-screen",
      renderer: "DocumentReadingScreen",
      label: "Чтение документа",
      manifest: documentReadingScreenManifest,
      registration: documentReadingScreenRegistration,
    },
    {
      id: "document-list-screen",
      renderer: "DocumentListScreen",
      label: "Список документов",
      manifest: documentListScreenManifest,
      registration: documentListScreenRegistration,
    },
  ])(
    "регистрирует $id в общем panel-content обоих макетов",
    ({ id, renderer, label, manifest, registration }) => {
      const component = realizeElementOwnerBindings.find(
        (item) => item.kind === "component" && item.identity.id === id,
      );
      if (component?.kind !== "component") {
        throw new Error(`Missing component binding: ${id}`);
      }
      expect(component.identity).toEqual({
        namespace: "realize",
        id,
      });
      expect(component.owner).toEqual({
        identity: realizeOwnerRegistry.rootProject,
      });
      expect(component.source).toEqual({
        definitionId: id,
        definitionVersion: "0.1.0",
        renderer: {
          path: `src/components/admin/documents/${renderer}.component.tsx`,
          exportName: renderer,
        },
      });
      expect(registration.owner).toEqual(component.owner);
      expect(manifest.owner).toEqual(component.owner);
      expect(registration.identity).toEqual(component.identity);
      expect(registration.version).toBe(component.source.definitionVersion);
      expect(JSON.parse(JSON.stringify(registration))).toEqual(registration);
      expect(manifest.usage).toEqual({
        scope: "preview-only",
        contentMode: "read-only",
      });
      expect(manifest.placement).toEqual({
        target: "admin",
        screen: "workspace",
        slot: "panel-content",
      });
      expect(manifest.agent.purpose).toBe("descriptive-only");
      expect(manifest.agent.operations).toEqual([]);
      expect(manifest.editor).toEqual({
        discovery: "metadata-only",
        label,
        group: "Документы",
        readOnly: true,
      });
      expect(Object.isFrozen(manifest.editor)).toBe(true);
      expect(Object.isFrozen(manifest.agent.hints)).toBe(true);
      for (const key of ["installed", "capabilities", "published", "canEdit"])
        expect(registration).not.toHaveProperty(key);
      // Существующий SDK подтверждает только наличие порта, не editor admission произвольных компонентов.
      for (const layoutId of CONTROL_PANEL_LAYOUT_IDS)
        expect(() =>
          assertLayoutSlots(
            resolveTemplateLayout(controlPanelLayoutCatalog, layoutId)
              .descriptor,
            [manifest.placement.slot],
          ),
        ).not.toThrow();
    },
  );

  it("сохраняет Pages 1.1 и различает template/palette при одинаковом native ID", () => {
    const pages = realizeElementOwnerBindings.find(
      (item) => item.kind === "collection",
    )!;
    expect(pages.source).toEqual({
      definitionId: pageAgentManifest.id,
      definitionVersion: "1.1",
    });
    const template = realizeElementOwnerBindings.find(
      (item) => item.kind === "template",
    )!;
    const palette = realizeElementOwnerBindings.find(
      (item) => item.kind === "palette",
    )!;
    expect(template.source).toEqual({
      templateId: controlPanelManifest.id,
      templateVersion: controlPanelManifest.version,
    });
    expect(palette.source).toEqual({
      templateId: controlPanelManifest.id,
      templateVersion: controlPanelManifest.version,
      paletteId: controlPanelManifest.palettes[0].id,
      paletteVersion: controlPanelManifest.palettes[0].version,
    });
    expect(controlPanelManifest.palettes[0].id).toBe(controlPanelManifest.id);
    expect(palette.identity).not.toEqual(template.identity);
  });

  it("сохраняет native layout ссылки и связывает их с новыми versioned metadata", () => {
    const layouts = realizeElementOwnerBindings.filter(
      (item) => item.kind === "layout",
    );
    expect(layouts.map((item) => item.source.layoutId)).toEqual([
      ...CONTROL_PANEL_LAYOUT_IDS,
    ]);
    for (const item of layouts) {
      expect(item.source).toEqual({
        templateId: controlPanelManifest.id,
        templateVersion: controlPanelManifest.version,
        layoutId: item.source.layoutId,
      });
      expect(item.source).not.toHaveProperty("layoutVersion");
      expect(item).not.toHaveProperty("version");
      const resolved = resolveTemplateLayout(
        controlPanelLayoutCatalog,
        item.source.layoutId,
      );
      expect(resolved.reference.identity).toEqual(item.identity);
      expect(resolved.descriptor.owner).toEqual(item.owner);
      expect(resolved.reference.version).toBe("0.1.0");
      expect(resolved.descriptor.version).toBe(resolved.reference.version);
    }
  });

  it("читает pure layout metadata и public export declarations без импорта admin renderer", () => {
    for (const path of Object.values(controlPanelPackage.exports))
      expect(
        existsSync(
          new URL(
            `../../packages/template-realizeai-control-panel/${path}`,
            import.meta.url,
          ),
        ),
      ).toBe(true);
    const path =
      "packages/template-realizeai-control-panel/src/controlPanel.index.ts";
    const source = ts.createSourceFile(
      path,
      readSource(path),
      ts.ScriptTarget.Latest,
      true,
    );
    const names = source.statements
      .filter(ts.isExportDeclaration)
      .flatMap((node) =>
        node.exportClause && ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements.map((item) => item.name.text)
          : [],
      );
    expect(names).toEqual(
      expect.arrayContaining([
        "controlPanelDefinition",
        "ControlPanelLayout",
        "ControlPanelWithoutTopbarLayout",
      ]),
    );
    expect(controlPanelLayoutCatalog.template).toEqual({
      identity: { namespace: "realize", id: controlPanelManifest.id },
      version: controlPanelManifest.version,
    });
    expect(controlPanelLayoutCatalog.defaultLayoutId).toBe("default");
    expect(
      controlPanelLayoutCatalog.aliases.map((alias) => alias.localId),
    ).toEqual([...CONTROL_PANEL_LAYOUT_IDS]);
    expect(controlPanelLayoutCatalog.descriptors).toHaveLength(2);
    expect(
      resolveTemplateLayout(
        controlPanelLayoutCatalog,
        "default",
      ).descriptor.regions.map((region) => region.key),
    ).toEqual(["rail", "topbar", "sidebar", "panel-content", "footer"]);
    expect(
      resolveTemplateLayout(
        controlPanelLayoutCatalog,
        "without-topbar",
      ).descriptor.regions.map((region) => region.key),
    ).toEqual(["rail", "sidebar", "panel-content", "footer"]);
  });

  it("сохраняет native настройки наследования и явного выбора обоих макетов", () => {
    expect(resolveControlPanelSettings({})).not.toHaveProperty("layoutId");
    expect(resolveControlPanelSettings({ layoutId: "default" }).layoutId).toBe(
      "default",
    );
    expect(
      resolveControlPanelSettings({ layoutId: "without-topbar" }).layoutId,
    ).toBe("without-topbar");
    expect(() =>
      resolveControlPanelSettings({ layoutId: "missing" }),
    ).toThrow();
  });

  it("не превращает template в owner и не повышает readiness или права", () => {
    expect(() =>
      resolveElementOwner(realizeOwnerRegistry, {
        identity: { namespace: "realize", id: controlPanelManifest.id },
      }),
    ).toThrow();
    const entry = extensionTemplateCatalog.find(
      (item) =>
        (item.manifest as { id: string }).id === controlPanelManifest.id,
    );
    expect(entry?.readiness).toBe("preview-only");
    expect(realizeOwnerRegistry).not.toHaveProperty("installed");
    expect(realizeOwnerRegistry).not.toHaveProperty("canEdit");
    expect(realizeOwnerRegistry).not.toHaveProperty("artifactDigest");
  });
});
