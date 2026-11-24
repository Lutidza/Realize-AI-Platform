// @vitest-environment node
/**
 * @file tests/int/element-owner-registry.int.spec.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Проверяет разрешение логических владельцев, metadata пакета и неизменяемость общего snapshot.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import { describe, expect, it } from "vitest";
import {
  createOwnerRegistry,
  resolveElementOwner,
} from "@realize/element-registry/server";

const identity = (id: string, namespace = "realize") => ({ namespace, id });
const projectIdentity = identity("project.realize-ai-platform");
const packageIdentity = identity("package.template-realizeai-control-panel");
const packageName = "@realize/template-realizeai-control-panel";

function packageMetadata(name = packageName) {
  return {
    name,
    version: "0.1.0",
    exports: {
      "./manifest": "./src/controlPanelManifest.index.ts",
      "./admin": "./src/controlPanel.index.ts",
      "./private": "./src/private.ts",
    } as Record<string, string>,
  };
}

function fixture() {
  return {
    rootProject: {
      kind: "project" as const,
      identity: { ...projectIdentity },
      title: "Realize AI Platform",
    },
    owners: [
      {
        kind: "package" as const,
        identity: { ...packageIdentity },
        title: "Пакет Control Panel",
        owner: { identity: { ...projectIdentity } },
      },
    ],
    packageBindings: [
      {
        identity: { ...packageIdentity },
        packageName,
        packageVersion: "0.1.0",
        requiredExports: ["./manifest", "./admin"],
      },
    ],
    trustedPackages: [packageMetadata()],
  };
}

function expectCode(action: () => unknown, code: string) {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

describe("Чистый registry логических владельцев", () => {
  it.each([undefined, null, [], "/system/appearance", 42])(
    "отклоняет форму запроса вне декларативного объекта: %j",
    (input) => {
      expectCode(() => createOwnerRegistry(input), "INVALID_INPUT");
    },
  );

  it("разрешает project и package через один выбранный snapshot", () => {
    const snapshot = createOwnerRegistry(fixture());
    expect(snapshot.schemaVersion).toBe("1.0");
    expect(snapshot.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.rootProject).toEqual(projectIdentity);
    expect(snapshot.registrations).toHaveLength(2);
    expect(
      resolveElementOwner(snapshot, { identity: packageIdentity }),
    ).toEqual({
      identity: packageIdentity,
      kind: "package",
      title: "Пакет Control Panel",
      rootProject: projectIdentity,
      snapshotHash: snapshot.snapshotHash,
    });
    expect(
      resolveElementOwner(snapshot, { identity: projectIdentity }),
    ).toEqual({
      identity: projectIdentity,
      kind: "project",
      title: "Realize AI Platform",
      rootProject: projectIdentity,
      snapshotHash: snapshot.snapshotHash,
    });
    expect(snapshot.packageBindings[0]).toMatchObject({
      identity: packageIdentity,
      packageName,
      packageVersion: "0.1.0",
      exports: {
        "./manifest": "./src/controlPanelManifest.index.ts",
        "./admin": "./src/controlPanel.index.ts",
      },
    });
    expect(
      Object.hasOwn(snapshot.packageBindings[0].exports, "./private"),
    ).toBe(false);
  });

  it("не смешивает namespace/id при совпадении склеенного имени и сохраняет регистр", () => {
    const input = fixture();
    const differentIdentities = [
      identity("button", "realize.ui"),
      identity("ui.button"),
      identity("package.ControlPanel"),
      identity("package.controlPanel"),
    ];
    input.owners.push(
      ...differentIdentities.map((value) => ({
        kind: "package" as const,
        identity: value,
        title: value.id,
        owner: { identity: { ...projectIdentity } },
      })),
    );
    const snapshot = createOwnerRegistry(input);
    for (const value of differentIdentities) {
      expect(
        resolveElementOwner(snapshot, { identity: value }).identity,
      ).toEqual(value);
    }
    expectCode(
      () =>
        resolveElementOwner(snapshot, {
          identity: identity("package.CONTROLPANEL"),
        }),
      "UNKNOWN_OWNER",
    );
  });

  it.each([
    "",
    " project",
    "project ",
    "project\t",
    "pro\u200bject",
    "pro\u2060ject",
    "pro\ufeffject",
    "../project",
  ])("отклоняет недопустимый identity token %j без исправления", (id) => {
    const input = fixture();
    input.rootProject.identity.id = id;
    expectCode(() => createOwnerRegistry(input), "INVALID_INPUT");
  });

  it("принимает граничные размеры namespace/id и отклоняет превышение", () => {
    const root = {
      kind: "project" as const,
      identity: identity("p".repeat(256), "r".repeat(63)),
      title: "Граничный root",
    };
    const input = {
      rootProject: root,
      owners: [],
      packageBindings: [],
      trustedPackages: [],
    };
    expect(createOwnerRegistry(input).rootProject).toEqual(root.identity);
    expectCode(
      () =>
        createOwnerRegistry({
          ...input,
          rootProject: {
            ...root,
            identity: { ...root.identity, namespace: "r".repeat(64) },
          },
        }),
      "INVALID_INPUT",
    );
    expectCode(
      () =>
        createOwnerRegistry({
          ...input,
          rootProject: {
            ...root,
            identity: { ...root.identity, id: "p".repeat(257) },
          },
        }),
      "INVALID_INPUT",
    );
  });

  it("не принимает kind/version и другие wire-поля внутри OwnerRef", () => {
    const snapshot = createOwnerRegistry(fixture());
    for (const ref of [
      { identity: packageIdentity, kind: "package" },
      { identity: packageIdentity, version: "0.1.0" },
      { ...packageIdentity },
      "/system/appearance",
      { identity: { ...packageIdentity, path: "package.json" } },
    ]) {
      expectCode(() => resolveElementOwner(snapshot, ref), "INVALID_INPUT");
    }
    const input = fixture();
    expectCode(
      () =>
        createOwnerRegistry({
          ...input,
          owners: [
            {
              ...input.owners[0],
              owner: { identity: projectIdentity, kind: "project" },
            },
          ],
        }),
      "INVALID_INPUT",
    );
  });

  it("не подменяет неизвестного владельца корневым проектом", () => {
    const snapshot = createOwnerRegistry(fixture());
    expectCode(
      () =>
        resolveElementOwner(snapshot, {
          identity: identity("package.unknown"),
        }),
      "UNKNOWN_OWNER",
    );
    const input = fixture();
    input.owners.push({
      kind: "package",
      identity: identity("package.unused"),
      title: "Неиспользуемая ошибочная регистрация",
      owner: { identity: identity("project.missing") },
    });
    expectCode(() => createOwnerRegistry(input), "UNKNOWN_OWNER");
  });

  it("отклоняет дубликат identity независимо от отличающихся полей", () => {
    const input = fixture();
    input.owners.push({ ...input.owners[0], title: "Второе заявление" });
    expectCode(() => createOwnerRegistry(input), "DUPLICATE_IDENTITY");
    const conflictingRoot = fixture();
    conflictingRoot.owners[0].identity = { ...projectIdentity };
    conflictingRoot.packageBindings = [];
    expectCode(
      () => createOwnerRegistry(conflictingRoot),
      "DUPLICATE_IDENTITY",
    );
  });

  it("отклоняет self-owner и неиспользуемый цикл при построении registry", () => {
    const self = fixture();
    self.owners[0].owner.identity = { ...packageIdentity };
    expectCode(() => createOwnerRegistry(self), "OWNER_CYCLE");
    const cycle = fixture();
    const first = identity("package.first");
    const second = identity("package.second");
    cycle.owners.push(
      {
        kind: "package",
        identity: first,
        title: "Первый",
        owner: { identity: second },
      },
      {
        kind: "package",
        identity: second,
        title: "Второй",
        owner: { identity: first },
      },
    );
    expectCode(() => createOwnerRegistry(cycle), "OWNER_CYCLE");
  });

  it("завершает цепочку только явным project root без собственного owner", () => {
    const input = fixture();
    expectCode(
      () =>
        createOwnerRegistry({
          ...input,
          rootProject: { ...input.rootProject, kind: "package" },
        }),
      "INVALID_INPUT",
    );
    expectCode(
      () =>
        createOwnerRegistry({
          ...input,
          rootProject: {
            ...input.rootProject,
            owner: { identity: projectIdentity },
          },
        }),
      "INVALID_INPUT",
    );
    const { owner: _owner, ...orphan } = input.owners[0];
    expectCode(
      () => createOwnerRegistry({ ...input, owners: [orphan] }),
      "INVALID_INPUT",
    );
    expectCode(
      () => createOwnerRegistry({ ...input, rootProject: undefined }),
      "INVALID_INPUT",
    );
  });
});

describe("Package binding и доверенные metadata", () => {
  it.each(["package.unknown", "realizeai-control-panel"])(
    "не создаёт package identity из неизвестного/native template ID %s",
    (id) => {
      const input = fixture();
      input.packageBindings[0].identity = identity(id);
      expectCode(() => createOwnerRegistry(input), "UNKNOWN_PACKAGE_OWNER");
    },
  );

  it("не принимает project вместо package в binding", () => {
    const input = fixture();
    input.packageBindings[0].identity = { ...projectIdentity };
    expectCode(() => createOwnerRegistry(input), "INVALID_PACKAGE_OWNER");
  });

  it("отклоняет повторные bindings и неоднозначные trusted metadata", () => {
    const duplicateBinding = fixture();
    duplicateBinding.packageBindings.push({
      ...duplicateBinding.packageBindings[0],
    });
    expectCode(
      () => createOwnerRegistry(duplicateBinding),
      "DUPLICATE_PACKAGE_BINDING",
    );
    const duplicateMetadata = fixture();
    duplicateMetadata.trustedPackages.push(packageMetadata());
    expectCode(
      () => createOwnerRegistry(duplicateMetadata),
      "DUPLICATE_TRUSTED_PACKAGE",
    );
  });

  it("сверяет имя, версию и обязательные exports с переданными metadata", () => {
    const wrongName = fixture();
    wrongName.trustedPackages[0].name = "@another/control-panel";
    expectCode(() => createOwnerRegistry(wrongName), "PACKAGE_NAME_MISMATCH");
    const wrongVersion = fixture();
    wrongVersion.trustedPackages[0].version = "0.2.0";
    expectCode(
      () => createOwnerRegistry(wrongVersion),
      "PACKAGE_VERSION_MISMATCH",
    );
    const missingExport = fixture();
    delete missingExport.trustedPackages[0].exports["./manifest"];
    expectCode(
      () => createOwnerRegistry(missingExport),
      "PACKAGE_EXPORT_UNAVAILABLE",
    );
  });

  it("не принимает дополнительные поля команд или claims в декларативных записях", () => {
    const input = fixture();
    expectCode(
      () => createOwnerRegistry({ ...input, installed: true }),
      "INVALID_INPUT",
    );
    expectCode(
      () =>
        createOwnerRegistry({
          ...input,
          owners: [{ ...input.owners[0], ready: true }],
        }),
      "INVALID_INPUT",
    );
    expectCode(
      () =>
        createOwnerRegistry({
          ...input,
          packageBindings: [
            { ...input.packageBindings[0], command: "npm install" },
          ],
        }),
      "INVALID_INPUT",
    );
  });
});

describe("Детерминированный и изолированный snapshot", () => {
  it("не зависит от порядка registrations, bindings, exports и metadata", () => {
    const input = fixture();
    const secondIdentity = identity("package.secondary");
    input.owners.push({
      kind: "package",
      identity: secondIdentity,
      title: "Второй контрольный пакет",
      owner: { identity: { ...projectIdentity } },
    });
    input.packageBindings.push({
      identity: secondIdentity,
      packageName: "@fixture/secondary-package",
      packageVersion: "0.1.0",
      requiredExports: ["./admin", "./manifest"],
    });
    input.trustedPackages.push(packageMetadata("@fixture/secondary-package"));
    const reordered = structuredClone(input);
    reordered.owners.reverse();
    reordered.packageBindings.reverse();
    reordered.trustedPackages.reverse();
    for (const binding of reordered.packageBindings)
      binding.requiredExports.reverse();
    for (const metadata of reordered.trustedPackages)
      metadata.exports = Object.fromEntries(
        Object.entries(metadata.exports).reverse(),
      );
    expect(createOwnerRegistry(reordered)).toEqual(createOwnerRegistry(input));
  });

  it("связывает hash с выбранными metadata, но не с посторонними exports", () => {
    const baseline = createOwnerRegistry(fixture());
    const irrelevant = fixture();
    irrelevant.trustedPackages[0].exports["./private"] = "./other/private.ts";
    irrelevant.trustedPackages.push(packageMetadata("@fixture/unused"));
    expect(createOwnerRegistry(irrelevant).snapshotHash).toBe(
      baseline.snapshotHash,
    );
    const changedExport = fixture();
    changedExport.trustedPackages[0].exports["./manifest"] =
      "./src/nextManifest.ts";
    expect(createOwnerRegistry(changedExport).snapshotHash).not.toBe(
      baseline.snapshotHash,
    );
    const changedVersion = fixture();
    changedVersion.packageBindings[0].packageVersion = "0.1.1";
    changedVersion.trustedPackages[0].version = "0.1.1";
    expect(createOwnerRegistry(changedVersion).snapshotHash).not.toBe(
      baseline.snapshotHash,
    );
    const changedOwner = fixture();
    changedOwner.owners[0].title = "Новое описание владельца";
    expect(createOwnerRegistry(changedOwner).snapshotHash).not.toBe(
      baseline.snapshotHash,
    );
  });

  it("отделяет входные данные и замораживает вложенные части результата", () => {
    const input = fixture();
    const snapshot = createOwnerRegistry(input);
    const expected = structuredClone(snapshot);
    input.rootProject.title = "Изменённый проект";
    input.owners[0].identity.id = "package.replaced";
    input.owners[0].owner.identity.id = "project.replaced";
    input.packageBindings[0].requiredExports.push("./private");
    input.trustedPackages[0].exports["./admin"] = "./other/admin.ts";
    expect(snapshot).toEqual(expected);
    expect(
      resolveElementOwner(snapshot, { identity: packageIdentity }).title,
    ).toBe("Пакет Control Panel");
    expect(
      Reflect.set(snapshot.registrations[0].identity, "id", "replaced"),
    ).toBe(false);
    expect(snapshot).toEqual(expected);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.rootProject)).toBe(true);
    expect(Object.isFrozen(snapshot.registrations)).toBe(true);
    expect(Object.isFrozen(snapshot.packageBindings[0].requiredExports)).toBe(
      true,
    );
    expect(Object.isFrozen(snapshot.packageBindings[0].exports)).toBe(true);
    const resolved = resolveElementOwner(snapshot, {
      identity: packageIdentity,
    });
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.identity)).toBe(true);
  });
});
