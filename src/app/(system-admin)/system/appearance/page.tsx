/**
 * @file src/app/(system-admin)/system/appearance/page.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Открывает каталог и операции appearance в самостоятельном Admin шаблоне.
 * @see documentation/specifications/extension-management.md
 */
import type { Metadata } from "next";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";
import { SystemAdminTemplateProvider } from "@/components/admin/system-shell/SystemAdminTemplateProvider.component";
import { SYSTEM_APPEARANCE_ROUTE } from "@/components/admin/system-shell/systemAdmin.routes";
import { ExtensionManager } from "@/components/admin/extensions/ExtensionManager.component";

export const metadata: Metadata = {
  title: "Темы и шаблоны | Realize",
  robots: { index: false, follow: false },
};

export default async function SystemAppearancePage() {
  const context = await requireSystemAdmin(SYSTEM_APPEARANCE_ROUTE);
  return (
    <SystemAdminTemplateProvider
      selection={context.appearance.selection}
      settings={context.appearance.settings}
      initialMode={context.initialTheme}
    >
      <ExtensionManager {...context} />
    </SystemAdminTemplateProvider>
  );
}
