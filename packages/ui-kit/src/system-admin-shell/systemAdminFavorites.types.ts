/**
 * @file packages/ui-kit/src/system-admin-shell/systemAdminFavorites.types.ts
 * @version 1.3.0
 * @date 2026-09-18
 * @description Описывает цели избранного и общий контракт закрепления меню.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { ReactNode } from "react";
import type {
  SystemAdminNavigationItem,
  SystemAdminNavigationLink,
} from "./SystemAdminShell.types";
import type { SystemAdminNavigationPreferences } from "./systemAdminNavigationPreferences.types";

export type SystemAdminFavoriteTarget = {
  id: string;
  sectionId?: string;
  item: SystemAdminNavigationLink;
};
export type SystemAdminFavoritesContextValue = {
  targets: SystemAdminFavoriteTarget[];
  selectedIds: string[];
  toggleFavorite: (id: string) => void;
};
export type SystemAdminFavoritesProviderProps = {
  navigation: SystemAdminNavigationItem[];
  preferences: SystemAdminNavigationPreferences;
  onToggle: (id: string) => void;
  children: ReactNode;
};
export type SystemAdminItemMenuProps = {
  favoriteId?: string;
  label: string;
  /** Доступный адрес пункта; действия со ссылкой не зависят от разрешения закреплять. */
  href?: string;
  actions?: SystemAdminItemMenuAction[];
  triggerIcon?: ReactNode;
  triggerLabel?: string;
  alwaysVisible?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
};
/** Host передаёт действия; UI-kit владеет видом, фокусом и доступностью меню. */
export type SystemAdminItemMenuAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Диалог сам принимает focus; закрывающееся меню не возвращает его trigger. */
  opensDialog?: boolean;
};
export type SystemAdminFavoritesProps = {
  onNavigate: () => void;
  onOpenSection?: (id: string) => void;
};
