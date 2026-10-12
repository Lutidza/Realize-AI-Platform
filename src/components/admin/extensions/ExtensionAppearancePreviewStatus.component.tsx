/**
 * @file src/components/admin/extensions/ExtensionAppearancePreviewStatus.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Отображает безопасный отказ предпросмотра через общий template status screen.
 */
"use client";
import { SystemAdminTemplateHost } from "../system-shell/SystemAdminTemplateHost.component";
import { SYSTEM_APPEARANCE_ROUTE } from "../system-shell/systemAdmin.routes";
import type { ExtensionAppearancePreviewStatusProps } from "./ExtensionAppearancePreview.types";

/** Route переводит actor/expiry/CAS failure в локализованный DTO без утечки исходной ошибки. */
export function ExtensionAppearancePreviewStatus({
  mode,
  status,
  message,
}: ExtensionAppearancePreviewStatusProps) {
  return (
    <SystemAdminTemplateHost
      screen="status"
      mode={mode}
      status={status}
      title="Предпросмотр недоступен"
      actions={[
        {
          id: "back-to-appearance",
          label: "Вернуться к назначениям",
          onSelect: () => window.location.assign(SYSTEM_APPEARANCE_ROUTE),
        },
      ]}
    >
      <p>{message}</p>
    </SystemAdminTemplateHost>
  );
}
