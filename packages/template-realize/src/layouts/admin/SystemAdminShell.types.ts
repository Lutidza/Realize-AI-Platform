/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminShell.types.ts
 * @version 1.15.0
 * @date 2026-10-12
 * @description Описывает переносимую оболочку системной админки без зависимостей от host.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { ReactNode } from "react";
import type { SystemAdminLocale } from "./systemAdminLocale.types";
import type { SystemAdminNavigationPreferences } from "./systemAdminNavigationPreferences.types";

/** Host задаёт действие строки; disabled блокирует и ссылку, и callback. */
export type SystemAdminNavigationLink = {
  id: string;
  label: string;
  icon: ReactNode;
  description?: string;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** Выбранный host-контекст; не выводится из URL внутри переносимого UI-kit. */
  active?: boolean;
  /** false исключает служебный пункт; недоступные и без действия исключаются автоматически. */
  favoriteable?: boolean;
  statusLabel?: string;
  /** Быстрые ссылки сохраняют собственную доступность независимо от родительского пункта. */
  shortcuts?: SystemAdminNavigationLink[];
  /** Место персонального списка; служебный контейнер не закрепляет сам себя. */
  favoritesSlot?: boolean;
};

export type SystemAdminNavigationLinkProps = {
  item: SystemAdminNavigationLink;
  onNavigate: () => void;
  onOpenSection?: (id: string) => void;
  favoriteId?: string;
};

/** Заголовок группы не выполняет переход; порядок строк принадлежит host. */
export type SystemAdminNavigationGroup = {
  id: string;
  label: string;
  items: SystemAdminNavigationLink[];
};

export type SystemAdminNavigationGroupsProps = {
  groups: SystemAdminNavigationGroup[];
  onNavigate: () => void;
  onOpenSection?: (id: string) => void;
};

/** Общая секция для стандартных ссылок и навигации модулей; не владеет прокруткой. */
export type SystemAdminNavigationSectionProps = {
  label: string;
  /** Убирает видимый заголовок первой группы, сохраняя её доступное имя. */
  hideHeading?: boolean;
  /** Компактное контекстное действие справа от заголовка, отдельно от содержимого. */
  action?: ReactNode;
  children: ReactNode;
};

/** Host передаёт готовые URL или локальные команды, не документы своей CMS. */
export type SystemAdminNavigationItem = {
  id: string;
  label: string;
  icon: ReactNode;
  description?: string;
  /** Раздел можно закрепить только по явному разрешению host и при наличии доступного содержимого. */
  favoriteable?: boolean;
  /** Host использует onNavigate после выбора; создание сущностей само по себе панель не закрывает. */
  panel?: ReactNode | ((onNavigate: () => void) => ReactNode);
  /** Общие группы подпунктов используют тот же lifecycle flyout, что и весь раздел. */
  groups?: SystemAdminNavigationGroup[];
  /** Доступные ссылки custom panel; host передаёт актуальные действия и глобально уникальные ID. */
  favoriteLinks?: SystemAdminNavigationLink[];
  /** Действие под прокручиваемым содержимым, с теми же проверками доступности. */
  footerAction?: Pick<
    SystemAdminNavigationLink,
    "label" | "icon" | "description" | "href" | "onSelect" | "disabled"
  >;
  onSelect?: () => void;
  href?: string;
  /** Скрытый по умолчанию раздел остаётся доступным через «Ещё». */
  hiddenByDefault?: boolean;
};

export type SystemAdminShellProps = {
  locale?: SystemAdminLocale;
  theme: "light" | "dark";
  onThemeChange?: (theme: "light" | "dark") => void;
  brand?: ReactNode;
  navigation: SystemAdminNavigationItem[];
  activeNavigationId: string;
  navigationPreferences?: SystemAdminNavigationPreferences;
  /** Host сохраняет персонализацию; без callback состояние живёт внутри Navigation. */
  onNavigationPreferencesChange?: (
    preferences: SystemAdminNavigationPreferences,
  ) => void;
  /** Дополнительная desktop-колонка; мобильное содержимое host передаёт в panel раздела. */
  secondaryNavigation: ReactNode | ((onNavigate: () => void) => ReactNode);
  headerActions?: ReactNode;
  /** Общая верхняя панель заменяет legacy headerActions и отдельный переключатель темы. */
  toolbar?: ReactNode;
  /** Контекстная строка внутри main; host задаёт семантику и прокрутку крошек. */
  breadcrumbs?: ReactNode;
  /** Действия страницы справа от контекстного пути; host сохраняет права и семантику. */
  contentActions?: ReactNode;
  /** Host определяет возврат и проверяет несохранённые изменения перед переходом. */
  backAction?: {
    onSelect: () => void;
    label?: string;
    disabled?: boolean;
  };
  children: ReactNode;
  footer?: ReactNode;
};

export type SystemAdminNavigationProps = Pick<
  SystemAdminShellProps,
  | "navigation"
  | "activeNavigationId"
  | "navigationPreferences"
  | "onNavigationPreferencesChange"
> & { onNavigate?: () => void; mobile?: boolean; theme: "light" | "dark" };

export type NavigationFlyoutPosition = {
  left: number;
  top: number;
  height?: number;
  maxHeight: number;
  arrowTop: number;
};
export type SystemAdminFlyoutProps = {
  item: SystemAdminNavigationItem;
  id: string;
  mobile: boolean;
  onClose: () => void;
  onNavigate: () => void;
  onOpenSection?: (id: string) => void;
};
