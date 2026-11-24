/**
 * @file src/components/admin/documents/documentRoutes.util.ts
 * @version 1.1.0
 * @date 2026-11-23
 * @description Канонизирует адреса раздела документов с параметрами предпросмотра.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { ControlPanelPreviewState } from "../control-panel-preview/ControlPanelPreview.types";
import { SYSTEM_DOCUMENTS_ROUTE } from "../system-shell/systemAdmin.routes";

/** Отклоняет дубликаты и значения вне диапазона, оставляя запас для вычисления SQL offset. */
export function parseDocumentPage(
  value: string | string[] | undefined,
): number | null {
  if (value === undefined) return 1;
  if (typeof value !== "string") return null;
  const page = Number(value);
  return Number.isInteger(page) &&
    page >= 1 &&
    page <= 2_147_483_647 &&
    String(page) === value
    ? page
    : null;
}

/** Возврат строится из номера страницы и фиксированного маршрута раздела. */
export function documentRoute(
  page: number,
  appearance: Partial<ControlPanelPreviewState>,
  slug?: string,
): string {
  const path =
    slug === undefined
      ? SYSTEM_DOCUMENTS_ROUTE
      : `${SYSTEM_DOCUMENTS_ROUTE}/${encodeURIComponent(slug)}`;
  return withDocumentQuery(
    path,
    slug === undefined ? "page" : "fromPage",
    page,
    appearance,
  );
}

/** Два сегмента формы сохраняют адреса всех одноуровневых slug статей. */
export function documentCreateRoute(
  page: number,
  appearance: Partial<ControlPanelPreviewState>,
): string {
  return withDocumentQuery(
    `${SYSTEM_DOCUMENTS_ROUTE}/actions/create`,
    "fromPage",
    page,
    appearance,
  );
}

function withDocumentQuery(
  path: string,
  pageKey: "page" | "fromPage",
  page: number,
  appearance: Partial<ControlPanelPreviewState>,
) {
  const query = new URLSearchParams();
  if (page > 1) query.set(pageKey, String(page));
  if (appearance.mode !== undefined) query.set("mode", appearance.mode);
  if (appearance.layoutId !== undefined)
    query.set("layout", appearance.layoutId);
  return query.size ? `${path}?${query}` : path;
}
