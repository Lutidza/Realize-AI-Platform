/**
 * @file packages/template-realizeai-control-panel/src/controlPanelOwnerRegistration.config.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Объявляет логического владельца пакета Control Panel без React и host-зависимостей.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import type { PackageOwnerRegistrationInput } from "@realize/element-registry";

/** Заявление пакета проверяет host; оно не предоставляет прав публикации namespace. */
export const controlPanelPackageOwnerRegistration = {
  kind: "package",
  identity: {
    namespace: "realize",
    id: "package.template-realizeai-control-panel",
  },
  title: "RealizeAI Control Panel",
  owner: {
    identity: { namespace: "realize", id: "project.realize-ai-platform" },
  },
} as const satisfies PackageOwnerRegistrationInput;
