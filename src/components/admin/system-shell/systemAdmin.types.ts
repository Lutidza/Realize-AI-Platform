/**
 * @file src/components/admin/system-shell/systemAdmin.types.ts
 * @version 1.5.0
 * @date 2026-10-19
 * @description Описывает безопасный контекст системного интерфейса после серверной проверки сессии.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { TemplateSettings } from "@realize/template-contracts";
import type { AdminShellMode } from "@realize/payload-extension-manager/contracts";
import type { AdminTemplateSelection } from "./adminAppearance.types";

/** Документ пользователя и токены остаются внутри серверного адаптера. */
export type SystemAdminContext = {
  initialTheme: "light" | "dark";
  themeCookieName: string;
  currentActor: { id: string; name: string };
  /** Selection и доступность host отдельны от SDK appearance; optional для прежних consumers. */
  adminShell?: {
    mode: AdminShellMode;
    nativeEnabled: boolean;
    requiresRecovery: boolean;
  };
  appearance: {
    selection: AdminTemplateSelection;
    settings: TemplateSettings;
    revision: number;
    persisted: boolean;
    storageReady: boolean;
    requiresRecovery: boolean;
  };
};

/** Reference route не читает рабочее назначение из базы. */
export type RequireSystemAdminOptions = {
  appearance?: "active" | "reference";
  /** Управление доступами требует browser cookie и отклоняет Authorization. */
  cookieOnly?: boolean;
};

/** Параметры сохранения режима определяет host, без зависимости client от Payload. */
export type SystemAdminThemeOptions = Pick<
  SystemAdminContext,
  "initialTheme" | "themeCookieName"
>;
