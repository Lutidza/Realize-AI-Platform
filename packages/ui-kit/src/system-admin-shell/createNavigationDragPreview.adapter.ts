/**
 * @file packages/ui-kit/src/system-admin-shell/createNavigationDragPreview.adapter.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Создаёт и освобождает образ всей строки для native drag навигации.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { NavigationDragPreviewProps } from "./SystemAdminNavigationCustomization.types";

/** Клон остаётся в теме исходной строки, но исключён из разметки, фокуса и дерева доступности. */
export function createNavigationDragPreview({
  row,
  dataTransfer,
  clientX,
  clientY,
}: NavigationDragPreviewProps): () => void {
  const bounds = row.getBoundingClientRect();
  const preview = row.cloneNode(true) as HTMLElement;
  preview.removeAttribute("data-navigation-row");
  preview.removeAttribute("data-drop-position");
  preview.dataset.dragging = "false";
  preview.dataset.dragPreview = "true";
  preview.setAttribute("aria-hidden", "true");
  preview.inert = true;
  for (const element of [
    preview,
    ...preview.querySelectorAll<HTMLElement>("*"),
  ]) {
    element.removeAttribute("id");
    element.removeAttribute("draggable");
    element.tabIndex = -1;
  }
  Object.assign(preview.style, {
    position: "fixed",
    left: "-10000px",
    top: "-10000px",
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  });
  row.parentElement?.append(preview);
  dataTransfer.setDragImage(
    preview,
    Math.max(0, Math.min(bounds.width, clientX - bounds.left)),
    Math.max(0, Math.min(bounds.height, clientY - bounds.top)),
  );
  return () => preview.remove();
}
