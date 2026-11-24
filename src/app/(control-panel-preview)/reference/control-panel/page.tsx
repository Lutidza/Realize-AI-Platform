/**
 * @file src/app/(control-panel-preview)/reference/control-panel/page.tsx
 * @version 1.3.0
 * @date 2026-11-22
 * @description Подключает новый пакет через общий host без изменения рабочего назначения.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ControlPanelPreview } from "./ControlPanelPreview.component";
import { parseControlPanelPreviewQuery } from "@/components/admin/control-panel-preview/parseControlPanelPreviewQuery.validator";

export const metadata: Metadata = {
  title: "RealizeAI Control Panel — каркас",
  robots: { index: false, follow: false },
};

/** Сервер проверяет начальный URL; дальнейшее переключение выполняет клиент без reload. */
export default async function ControlPanelPreviewPage({
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
      `/reference/control-panel${preview.mode === "dark" ? "?mode=dark" : ""}`,
    );
  return <ControlPanelPreview {...preview} />;
}
