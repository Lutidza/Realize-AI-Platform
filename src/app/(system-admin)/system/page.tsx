/**
 * @file src/app/(system-admin)/system/page.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Открывает выбранную оболочку после server session и host policy проверки.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";
import { SYSTEM_ADMIN_ROUTE } from "@/components/admin/system-shell/systemAdmin.routes";
import { SystemAdminTemplateProvider } from "@/components/admin/system-shell/SystemAdminTemplateProvider.component";
import { SystemAdminWorkspace } from "@/components/admin/workspace/SystemAdminWorkspace.component";

export const metadata: Metadata = {
  title: "Рабочая область | Realize",
  robots: { index: false, follow: false },
};
export default async function SystemAdminPage() {
  const context = await requireSystemAdmin(SYSTEM_ADMIN_ROUTE);
  if (context.adminShell?.mode === "native") redirect("/admin");
  return (
    <SystemAdminTemplateProvider
      selection={context.appearance.selection}
      settings={context.appearance.settings}
      initialMode={context.initialTheme}
    >
      <SystemAdminWorkspace {...context} />
    </SystemAdminTemplateProvider>
  );
}
