/**
 * @file src/app/(system-admin)/system/appearance/preview/[planId]/page.tsx
 * @version 1.1.0
 * @date 2026-10-12
 * @description Показывает точный кандидат из защищённого плана без смены рабочего назначения.
 * @see documentation/specifications/extension-management.md
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ExtensionManagerError,
  extensionRequestIdSchema,
} from "@realize/payload-extension-manager/contracts";
import { ExtensionAppearancePreview } from "@/components/admin/extensions/ExtensionAppearancePreview.component";
import { ExtensionAppearancePreviewStatus } from "@/components/admin/extensions/ExtensionAppearancePreviewStatus.component";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";
import { readSystemAppearancePreview } from "@/components/admin/system-shell/readSystemAppearancePreview.service";
import { SystemAdminTemplateProvider } from "@/components/admin/system-shell/SystemAdminTemplateProvider.component";
import { systemAppearancePreviewRoute } from "@/components/admin/system-shell/systemAdmin.routes";

export const metadata: Metadata = {
  title: "Предпросмотр шаблона | Realize",
  robots: { index: false, follow: false },
};

export default async function SystemAppearancePreviewPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const context = await requireSystemAdmin(
    systemAppearancePreviewRoute(planId),
    { appearance: "reference" },
  );
  if (!extensionRequestIdSchema.safeParse(planId).success) notFound();
  const plan = await readSystemAppearancePreview(planId).catch(
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
        message="План недоступен для текущей сессии либо устарел. Вернитесь к назначениям и подготовьте новый план."
      />
    );
  if (
    plan.target !== "admin" ||
    plan.desiredAssignment.selection.target !== "admin"
  )
    notFound();
  return (
    <SystemAdminTemplateProvider
      selection={{ ...plan.desiredAssignment.selection, target: "admin" }}
      settings={plan.desiredAssignment.settings}
      initialMode={plan.desiredAssignment.selection.mode}
    >
      <ExtensionAppearancePreview
        assignment={plan.desiredAssignment}
        expiresAt={plan.expiresAt}
        currentActor={context.currentActor}
      />
    </SystemAdminTemplateProvider>
  );
}
