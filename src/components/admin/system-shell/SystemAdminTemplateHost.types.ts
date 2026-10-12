/**
 * @file src/components/admin/system-shell/SystemAdminTemplateHost.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Описывает нейтральные модели Admin экранов с host-owned content slot.
 */

import type { ReactNode } from "react";
import type {
  TemplateAdminAuthProps,
  TemplateAdminStatusProps,
  TemplateAdminWorkspaceProps,
} from "@realize/template-contracts/react";

/** Host поставляет identity/settings, children преобразуются в SDK content. */
export type SystemAdminTemplateHostProps = (
  | Omit<
      TemplateAdminWorkspaceProps,
      "target" | "paletteId" | "settings" | "content"
    >
  | Omit<
      TemplateAdminAuthProps,
      "target" | "paletteId" | "settings" | "content"
    >
  | Omit<
      TemplateAdminStatusProps,
      "target" | "paletteId" | "settings" | "content"
    >
) & { children: ReactNode };
