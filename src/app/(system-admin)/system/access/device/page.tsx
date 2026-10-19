/**
 * @file src/app/(system-admin)/system/access/device/page.tsx
 * @version 1.0.0
 * @date 2026-10-19
 * @description Открывает ручное подтверждение CLI без device secrets или кодов в URL.
 * @see documentation/architecture/platform-access.md
 */
import type { Metadata } from "next";
import { DeviceAccess } from "@/components/admin/access-tokens/DeviceAccess.component";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";
import { SYSTEM_ACCESS_DEVICE_ROUTE } from "@/components/admin/system-shell/systemAdmin.routes";
import { SystemAdminTemplateProvider } from "@/components/admin/system-shell/SystemAdminTemplateProvider.component";

export const metadata: Metadata = {
  title: "Подключение CLI | Realize",
  robots: { index: false, follow: false },
};

export default async function SystemAccessDevicePage() {
  const context = await requireSystemAdmin(SYSTEM_ACCESS_DEVICE_ROUTE, {
    cookieOnly: true,
  });
  return (
    <SystemAdminTemplateProvider
      selection={context.appearance.selection}
      settings={context.appearance.settings}
      initialMode={context.initialTheme}
      nativeAdminEnabled={context.adminShell?.nativeEnabled}
    >
      <DeviceAccess {...context} />
    </SystemAdminTemplateProvider>
  );
}
