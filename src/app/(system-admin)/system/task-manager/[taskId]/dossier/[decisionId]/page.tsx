/**
 * @file src/app/(system-admin)/system/task-manager/[taskId]/dossier/[decisionId]/page.tsx
 * @version 1.0.0
 * @date 2026-11-26
 * @description Открывает авторизованному участнику три сохранённых материала тестового аудита задачи.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";
import { TaskAuditDossier } from "@/components/admin/task-manager/dossier/TaskAuditDossier.component";
import { TaskAuditDossierShell } from "@/components/admin/task-manager/dossier/TaskAuditDossierShell.component";
import { readTaskAuditDossierPage } from "@/components/admin/task-manager/dossier/readTaskAuditDossierPage.service";
import { isAuditDossierPreviewEnabled } from "@/components/admin/task-manager/dossier/taskAuditDossierPreview.config";
import { taskAuditDossierRoute } from "@/components/admin/task-manager/dossier/taskAuditDossier.routes";
import { SystemAdminTemplateProvider } from "@/components/admin/system-shell/SystemAdminTemplateProvider.component";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Досье аудита | Realize",
  robots: { index: false, follow: false },
};
export default async function TaskAuditDossierPage({
  params,
}: {
  params: Promise<{ taskId: string; decisionId: string }>;
}) {
  if (!isAuditDossierPreviewEnabled()) notFound();
  const { taskId, decisionId } = await params;
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  if (!uuid.test(taskId) || !uuid.test(decisionId)) notFound();
  const context = await requireSystemAdmin(
    taskAuditDossierRoute(taskId, decisionId),
    { cookieOnly: true },
  );
  const view = await readTaskAuditDossierPage(
    context.currentActor.id,
    taskId,
    decisionId,
  );
  if (!view) notFound();
  return (
    <SystemAdminTemplateProvider
      selection={context.appearance.selection}
      settings={context.appearance.settings}
      initialMode={context.initialTheme}
    >
      <TaskAuditDossierShell
        initialTheme={context.initialTheme}
        themeCookieName={context.themeCookieName}
      >
        <TaskAuditDossier view={view} />
      </TaskAuditDossierShell>
    </SystemAdminTemplateProvider>
  );
}
