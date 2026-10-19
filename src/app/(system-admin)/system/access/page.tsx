/**
 * @file src/app/(system-admin)/system/access/page.tsx
 * @version 1.0.0
 * @date 2026-10-19
 * @description Открывает центр доступов только после проверки browser cookie session администратора.
 * @see documentation/architecture/platform-access.md
 */
import type { Metadata } from "next";
import { AccessCenter } from "@/components/admin/access-tokens/AccessCenter.component";
import type { AccessPageProps } from "@/components/admin/access-tokens/AccessTokens.types";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";
import { SYSTEM_ACCESS_ROUTE } from "@/components/admin/system-shell/systemAdmin.routes";
import { SystemAdminTemplateProvider } from "@/components/admin/system-shell/SystemAdminTemplateProvider.component";
import { accessManagementOptions } from "@/plugins/accessManagement.config";

export const metadata: Metadata = {
  title: "Доступы и токены | Realize",
  robots: { index: false, follow: false },
};

export default async function SystemAccessPage({
  searchParams,
}: AccessPageProps) {
  const context = await requireSystemAdmin(SYSTEM_ACCESS_ROUTE, {
    cookieOnly: true,
  });
  const query = await searchParams;
  const taskManagerUrl = `${new URL(accessManagementOptions.publicURL).origin}/api/task-manager`;
  // URL берётся из того же host config, что проверяет Origin; shell literal не интерполирует его содержимое.
  const cliLoginCommand = `npm run --silent task:workspace -- login --url '${taskManagerUrl.replaceAll("'", "'\\''")}'`;
  const ownerId =
    typeof query.ownerId === "string" && query.ownerId.length <= 128
      ? query.ownerId
      : undefined;
  return (
    <SystemAdminTemplateProvider
      selection={context.appearance.selection}
      settings={context.appearance.settings}
      initialMode={context.initialTheme}
      nativeAdminEnabled={context.adminShell?.nativeEnabled}
    >
      <AccessCenter
        {...context}
        initialOwnerId={ownerId}
        cliLoginCommand={cliLoginCommand}
      />
    </SystemAdminTemplateProvider>
  );
}
