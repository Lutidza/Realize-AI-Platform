/**
 * @file src/app/(system-admin)/system/workshop/page.tsx
 * @version 1.2.0
 * @date 2026-10-12
 * @description Открывает Мастерскую только после серверной проверки администратора.
 * @see documentation/specifications/design-workshop.md
 */

import type { Metadata } from "next";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";
import { SystemAdminTemplateProvider } from "@/components/admin/system-shell/SystemAdminTemplateProvider.component";
import { SYSTEM_WORKSHOP_ROUTE } from "@/components/admin/system-shell/systemAdmin.routes";
import { DesignWorkshopHost } from "@/components/admin/design-workshop/DesignWorkshopHost.component";

export const metadata: Metadata = {
  title: "Мастерская | Realize",
  robots: { index: false, follow: false },
};

export default async function DesignWorkshopPage() {
  const context = await requireSystemAdmin(SYSTEM_WORKSHOP_ROUTE);
  return (
    <SystemAdminTemplateProvider
      selection={context.appearance.selection}
      settings={context.appearance.settings}
      initialMode={context.initialTheme}
    >
      <DesignWorkshopHost initialTheme={context.initialTheme} />
    </SystemAdminTemplateProvider>
  );
}
