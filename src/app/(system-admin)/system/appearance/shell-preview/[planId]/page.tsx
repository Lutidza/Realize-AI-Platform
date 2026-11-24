/**
 * @file src/app/(system-admin)/system/appearance/shell-preview/[planId]/page.tsx
 * @version 1.0.1
 * @date 2026-11-12
 * @description Показывает exact candidate из shell plan после session/actor/TTL/CAS проверки.
 * @see documentation/specifications/extension-management.md
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ExtensionManagerError,
  extensionRequestIdSchema,
} from "@realize/payload-extension-manager/contracts";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";
import { readSystemAdminShellPreview } from "@/components/admin/system-shell/readSystemAdminShellPreview.service";
import { systemAdminShellPreviewRoute } from "@/components/admin/system-shell/systemAdmin.routes";
import { SystemAdminTemplateProvider } from "@/components/admin/system-shell/SystemAdminTemplateProvider.component";
import { ExtensionAppearancePreview } from "@/components/admin/extensions/ExtensionAppearancePreview.component";
import { ExtensionAppearancePreviewStatus } from "@/components/admin/extensions/ExtensionAppearancePreviewStatus.component";

export const metadata: Metadata = {
  title: "Предпросмотр оболочки | Realize",
  robots: { index: false, follow: false },
};
export default async function SystemAdminShellPreviewPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const context = await requireSystemAdmin(
    systemAdminShellPreviewRoute(planId, "template"),
    { appearance: "reference" },
  );
  if (!extensionRequestIdSchema.safeParse(planId).success) notFound();
  const plan = await readSystemAdminShellPreview(planId).catch(
    (error: unknown) => {
      if (error instanceof ExtensionManagerError) return null;
      throw error;
    },
  );
  if (!plan)
    return (
      <ExtensionAppearancePreviewStatus
        mode={context.initialTheme}
        status="error"
        message="План недоступен для текущей сессии либо устарел. Подготовьте новый план в разделе оформления."
      />
    );
  const assignment = plan.templateBinding?.assignment;
  if (
    plan.desiredMode !== "template" ||
    !assignment ||
    assignment.selection.target !== "admin"
  )
    notFound();
  return (
    <SystemAdminTemplateProvider
      selection={{ ...assignment.selection, target: "admin" }}
      settings={assignment.settings}
      initialMode={assignment.selection.mode}
    >
      <ExtensionAppearancePreview
        assignment={assignment}
        expiresAt={plan.expiresAt}
        currentActor={context.currentActor}
        readiness={plan.readiness}
      />
    </SystemAdminTemplateProvider>
  );
}
