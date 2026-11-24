/**
 * @file src/app/(system-admin)/system/documents/actions/create/page.tsx
 * @version 1.0.1
 * @date 2026-11-24
 * @description Открывает защищённую форму создания статьи в выбранном макете Control Panel.
 * @see documentation/specifications/realize-ai-control-panel/documents/creation.md
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { parseControlPanelPreviewQuery } from "@/components/admin/control-panel-preview/parseControlPanelPreviewQuery.validator";
import { ArticleCreateForm } from "@/components/admin/documents/ArticleCreateForm.component";
import {
  documentCreateRoute,
  parseDocumentPage,
} from "@/components/admin/documents/documentRoutes.util";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";

export const metadata: Metadata = {
  title: "Создать статью | RealizeAI Control Panel",
  robots: { index: false, follow: false },
};

/** Список и форма используют одинаковую проверку cookie и URL предпросмотра. */
export default async function CreateArticlePage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string | string[];
    layout?: string | string[];
    fromPage?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const fromPage = parseDocumentPage(query.fromPage);
  const preview = parseControlPanelPreviewQuery(query);
  if (fromPage === null || !preview) notFound();
  const returnTo = documentCreateRoute(fromPage, {
    ...preview,
    mode: query.mode === undefined ? undefined : preview.mode,
  });
  await requireSystemAdmin(returnTo, {
    appearance: "reference",
    cookieOnly: true,
  });
  if (query.fromPage === "1" || query.layout === "") redirect(returnTo);

  return <ArticleCreateForm fromPage={fromPage} {...preview} />;
}
