/**
 * @file src/app/(system-admin)/system/documents/[slug]/page.tsx
 * @version 1.1.0
 * @date 2026-11-22
 * @description Показывает разрешённый документ в Control Panel с отдельной проверкой сессии и URL макета.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isDocumentSlug } from "@/collections/Documents/documentIdentifiers";
import { DocumentReadingScreen } from "@/components/admin/documents/DocumentReadingScreen.component";
import { DocumentSectionLink } from "@/components/admin/documents/DocumentSectionLink.component";
import {
  documentRoute,
  parseDocumentPage,
} from "@/components/admin/documents/documentRoutes.util";
import { readDocumentReadingScreen } from "@/components/admin/documents/readDocumentReadingScreen.service";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";
import { ControlPanelPreview } from "@/components/admin/control-panel-preview/ControlPanelPreview.component";
import { parseControlPanelPreviewQuery } from "@/components/admin/control-panel-preview/parseControlPanelPreviewQuery.validator";

export const metadata: Metadata = {
  title: "Документ | RealizeAI Control Panel",
  robots: { index: false, follow: false },
};

/** Без документа возвращает notFound; preview controls не изменяют рабочее назначение. */
export default async function SystemDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    fromPage?: string | string[];
    mode?: string | string[];
    layout?: string | string[];
  }>;
}) {
  const { slug } = await params;
  if (!isDocumentSlug(slug)) notFound();
  const query = await searchParams;
  const fromPage = parseDocumentPage(query.fromPage);
  const preview = parseControlPanelPreviewQuery(query);
  if (fromPage === null || !preview) notFound();
  const returnTo = documentRoute(
    fromPage,
    {
      ...preview,
      mode: query.mode === undefined ? undefined : preview.mode,
    },
    slug,
  );
  await requireSystemAdmin(returnTo, {
    appearance: "reference",
    cookieOnly: true,
  });
  if (query.layout === "" || query.fromPage === "1") redirect(returnTo);
  const document = await readDocumentReadingScreen(slug);
  if (!document) notFound();
  return (
    <ControlPanelPreview {...preview}>
      <DocumentReadingScreen
        {...document}
        navigation={
          <DocumentSectionLink page={fromPage}>
            Все документы
          </DocumentSectionLink>
        }
      />
    </ControlPanelPreview>
  );
}
