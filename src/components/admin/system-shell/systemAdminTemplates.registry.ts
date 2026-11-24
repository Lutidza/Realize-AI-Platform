/**
 * @file src/components/admin/system-shell/systemAdminTemplates.registry.ts
 * @version 1.1.0
 * @date 2026-11-11
 * @description Регистрирует проверенные compiled exports встроенных Admin шаблонов.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { TemplateDefinition } from "@realize/template-contracts/react";
import { controlPanelDefinition } from "@realize/template-realizeai-control-panel/admin";
import { realizeTemplateDefinition } from "@realize/template-realize/admin";

/** Новая строка JSON не добавляет renderer; регистрируются только exports текущей сборки. */
export const SYSTEM_ADMIN_TEMPLATES: readonly TemplateDefinition[] = [
  realizeTemplateDefinition,
  controlPanelDefinition,
];
