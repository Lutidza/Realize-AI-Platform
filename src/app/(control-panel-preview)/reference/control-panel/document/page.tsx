/**
 * @file src/app/(control-panel-preview)/reference/control-panel/document/page.tsx
 * @version 1.0.0
 * @date 2026-11-22
 * @description Подключает экран чтения к существующему preview shell без обращения к БД.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DocumentReadingScreen } from "@/components/admin/documents/DocumentReadingScreen.component";
import { ControlPanelPreview } from "@/components/admin/control-panel-preview/ControlPanelPreview.component";
import { parseControlPanelPreviewQuery } from "@/components/admin/control-panel-preview/parseControlPanelPreviewQuery.validator";
import { documentReadingPreviewFixture } from "./documentReadingPreview.fixture";

export const metadata: Metadata = {
  title: "Документ — RealizeAI Control Panel",
  robots: { index: false, follow: false },
};

/** Начальные mode/layout проверяются тем же контрактом, что и у grid preview. */
export default async function DocumentReadingPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string | string[];
    layout?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const preview = parseControlPanelPreviewQuery(params);
  if (!preview) notFound();
  if (params.layout === "")
    redirect(
      `/reference/control-panel/document${preview.mode === "dark" ? "?mode=dark" : ""}`,
    );
  return (
    <ControlPanelPreview {...preview}>
      <DocumentReadingScreen {...documentReadingPreviewFixture} />
    </ControlPanelPreview>
  );
}
