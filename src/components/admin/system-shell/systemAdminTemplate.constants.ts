/**
 * @file src/components/admin/system-shell/systemAdminTemplate.constants.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Создаёт единственный React context compiled Admin template host.
 */

"use client";
import { createContext } from "react";
import type { SystemAdminTemplateContextValue } from "./SystemAdminTemplateProvider.types";

export const SYSTEM_ADMIN_TEMPLATE_CONTEXT =
  createContext<SystemAdminTemplateContextValue | null>(null);
