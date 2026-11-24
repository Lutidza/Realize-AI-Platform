/**
 * @file src/registry/realizeOwnerRegistry.config.ts
 * @version 1.0.1
 * @date 2026-11-17
 * @description Собирает доверенный снимок двух владельцев и привязку пакета текущего host.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import { createOwnerRegistry } from "@realize/element-registry/server";
import { controlPanelPackageOwnerRegistration } from "@realize/template-realizeai-control-panel/registry";
import controlPanelPackage from "@realize/template-realizeai-control-panel/package.json";
import hostPackage from "../../package.json";

/** Явный host anchor; identity не выводится из npm name, Git или runtime env. */
export const realizeProjectOwnerRegistration = {
  kind: "project",
  identity: { namespace: "realize", id: "project.realize-ai-platform" },
  title: "Realize — AI Platform",
} as const;

/** Версия выбранной зависимости — pin поставки, независимый от template version. */
export const realizeOwnerRegistry = createOwnerRegistry({
  rootProject: realizeProjectOwnerRegistration,
  owners: [controlPanelPackageOwnerRegistration],
  packageBindings: [
    {
      identity: controlPanelPackageOwnerRegistration.identity,
      packageName: "@realize/template-realizeai-control-panel",
      packageVersion:
        hostPackage.dependencies["@realize/template-realizeai-control-panel"],
      requiredExports: [
        "./manifest",
        "./admin",
        "./settings",
        "./registry",
        "./layouts",
      ],
    },
  ],
  trustedPackages: [
    {
      name: controlPanelPackage.name,
      version: controlPanelPackage.version,
      exports: controlPanelPackage.exports,
    },
  ],
});
