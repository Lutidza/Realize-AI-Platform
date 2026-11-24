/**
 * @file src/app/(system-admin)/system/documents/page.tsx
 * @version 1.0.0
 * @date 2026-11-22
 * @description Открывает защищённый список документов в выбранном макете Control Panel.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ControlPanelPreview } from "@/components/admin/control-panel-preview/ControlPanelPreview.component";
import { parseControlPanelPreviewQuery } from "@/components/admin/control-panel-preview/parseControlPanelPreviewQuery.validator";
import { DocumentListScreen } from "@/components/admin/documents/DocumentListScreen.component";
import {
  documentRoute,
  parseDocumentPage,
} from "@/components/admin/documents/documentRoutes.util";
import { readDocumentList } from "@/components/admin/documents/readDocumentList.service";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";

export const metadata: Metadata = {
  title: "Документы | RealizeAI Control Panel",
  robots: { index: false, follow: false },
};

/** Проверяет вход до чтения списка и перенаправления по метаданным пагинации. */
export default async function SystemDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    mode?: string | string[];
    layout?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const page = parseDocumentPage(query.page);
  const preview = parseControlPanelPreviewQuery(query);
  if (page === null || !preview) notFound();
  const appearance = {
    ...preview,
    mode: query.mode === undefined ? undefined : preview.mode,
  };
  const returnTo = documentRoute(page, appearance);
  await requireSystemAdmin(returnTo, {
    appearance: "reference",
    cookieOnly: true,
  });
  if (query.page === "1" || query.layout === "") redirect(returnTo);
  const documents = await readDocumentList(page);
  if (!documents) notFound();
  if (page > documents.totalPages)
    redirect(documentRoute(documents.totalPages, appearance));

  return (
    // Новый номер страницы сбрасывает прокрутку внутри panel-content.
    <ControlPanelPreview key={page} {...preview}>
      <DocumentListScreen {...documents} />
    </ControlPanelPreview>
  );
}
