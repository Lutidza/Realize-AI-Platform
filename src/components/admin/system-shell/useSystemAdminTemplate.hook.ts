/**
 * @file src/components/admin/system-shell/useSystemAdminTemplate.hook.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Читает единственное выбранное определение Admin шаблона у host provider.
 */

"use client";
import { useContext } from "react";
import { SYSTEM_ADMIN_TEMPLATE_CONTEXT } from "./systemAdminTemplate.constants";
import type { SystemAdminTemplateContextValue } from "./SystemAdminTemplateProvider.types";

/** Отсутствие host provider — ошибка композиции; скрытый concrete fallback не выбирается. */
export function useSystemAdminTemplate(): SystemAdminTemplateContextValue {
  const context = useContext(SYSTEM_ADMIN_TEMPLATE_CONTEXT);
  if (!context) throw new Error("SystemAdminTemplateProvider is required");
  return context;
}
