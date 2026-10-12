/**
 * @file src/components/admin/system-shell/systemAdminTemplates.registry.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Регистрирует проверенные compiled exports встроенных Admin шаблонов.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { TemplateDefinition } from "@realize/template-contracts/react";
import { realizeTemplateDefinition } from "@realize/template-realize/admin";

/** Новая строка JSON не добавляет renderer; регистрируются только exports текущей сборки. */
export const SYSTEM_ADMIN_TEMPLATES: readonly TemplateDefinition[] = [
  realizeTemplateDefinition,
];
