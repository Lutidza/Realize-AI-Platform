/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminNavigationCustomization.types.ts
 * @version 1.1.1
 * @date 2026-10-12
 * @description Описывает представления скрытых разделов и настройки порядка общей навигации.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { SystemAdminNavigationItem } from "./SystemAdminShell.types";
import type { SystemAdminNavigationPreferences } from "./systemAdminNavigationPreferences.types";

/** Выбор включает скрытый раздел в rail и открывает его панель; переход остаётся отдельным действием. */
export type SystemAdminNavigationMoreProps = {
  items: SystemAdminNavigationItem[];
  activeNavigationId: string;
  onSelect: (id: string) => void;
  onCustomize: () => void;
};

/** Items содержат все разрешённые разделы в текущем порядке, в том числе скрытые. */
export type SystemAdminNavigationSettingsProps = {
  items: SystemAdminNavigationItem[];
  preferences: SystemAdminNavigationPreferences;
  onChange: (preferences: SystemAdminNavigationPreferences) => void;
  onReset: () => void;
  onDone: () => void;
};

export type NavigationReorderProps = Pick<
  SystemAdminNavigationSettingsProps,
  "items" | "preferences" | "onChange"
>;

/** Маркер задаёт конкретную границу строки, одинаковую для отображения и drop. */
export type NavigationDropTarget = {
  id: string;
  position: "before" | "after";
};

/** Native drag использует снимок целой строки в текущем контексте темы. */
export type NavigationDragPreviewProps = {
  row: HTMLElement;
  dataTransfer: DataTransfer;
  clientX: number;
  clientY: number;
};
