/**
 * @file packages/template-contracts/src/TemplatePresentation.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Определяет семантический React API поверхностей без Next и Payload.
 * @see documentation/specifications/design-workshop.md
 */

import type { ReactNode } from "react";
import type { TemplateMode } from "./TemplateManifest.types";
import type { TemplateSettings } from "./TemplateValue.types";

/** Первая поставка переводов поддерживает те же языки, что действующая оболочка. */
export type TemplateLocale = "ru" | "en";

/** Host передаёт только доступные действия и сам сохраняет права и бизнес-решения. */
export type TemplateAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
};

/** URL и callback принадлежат host, шаблон не выводит права из href. */
export type TemplateNavigationLink = {
  id: string;
  label: string;
  icon: ReactNode;
  description?: string;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  active?: boolean;
  favoriteable?: boolean;
  statusLabel?: string;
  shortcuts?: TemplateNavigationLink[];
  favoritesSlot?: boolean;
};

/** Семантические группы навигации сохраняются при замене композиции. */
export type TemplateNavigationGroup = {
  id: string;
  label: string;
  items: TemplateNavigationLink[];
};

/** panel — отдельное содержимое модуля, не целиком opaque navigation/header. */
export type TemplateNavigationItem = {
  id: string;
  label: string;
  icon: ReactNode;
  description?: string;
  favoriteable?: boolean;
  panel?: ReactNode | ((onNavigate: () => void) => ReactNode);
  groups?: TemplateNavigationGroup[];
  favoriteLinks?: TemplateNavigationLink[];
  footerAction?: Pick<
    TemplateNavigationLink,
    "label" | "icon" | "description" | "href" | "onSelect" | "disabled"
  >;
  onSelect?: () => void;
  href?: string;
  hiddenByDefault?: boolean;
};

/** Персонализация порядка/видимости не изменяет registry или ACL host. */
export type TemplateNavigationPreferences = {
  order: string[];
  hidden: string[];
  favorites?: string[];
  hiddenItems?: string[];
};

/** Путь и варианты выбора принадлежат host; renderer выбирает размещение. */
export type TemplateBreadcrumb = TemplateAction & {
  choices?: TemplateAction[];
  actions?: TemplateAction[];
  parentLabel?: string;
};

/** Возможности необязательны: отсутствие группы не требует фиктивного callback. */
export type TemplateCapabilities = {
  search?: {
    entries: (TemplateAction & {
      group: string;
      description?: string;
      keywords?: string;
    })[];
  };
  create?: { actions: TemplateAction[]; onCreate?: () => void };
  assistant?: { onSelect: () => void };
  notifications?: {
    items: (TemplateAction & { description: string; unread: boolean })[];
    onReadAll: () => void;
  };
  account?: {
    user: { name: string; initials: string; description?: string };
    profileActions: TemplateAction[];
    billingActions?: TemplateAction[];
    signOutAction?: TemplateAction;
  };
};

/** Оформление и body slot общие; settings — уже проверенный host снимок. */
export type TemplatePresentationBase = {
  mode: TemplateMode;
  paletteId: string;
  settings: TemplateSettings;
  content: ReactNode;
  brand?: ReactNode;
  locale?: TemplateLocale;
  onLocaleChange?: (locale: TemplateLocale) => void;
  onModeChange?: (mode: TemplateMode) => void;
};

/** Рабочий экран принимает семантику chrome, а состояние модуля остаётся выше renderer. */
export type TemplateAdminWorkspaceProps = TemplatePresentationBase & {
  target: "admin";
  screen: "workspace";
  context?: ReactNode;
  navigation: TemplateNavigationItem[];
  activeNavigationId: string;
  navigationPreferences?: TemplateNavigationPreferences;
  onNavigationPreferencesChange?: (
    preferences: TemplateNavigationPreferences,
  ) => void;
  secondaryNavigation?: ReactNode | ((onNavigate: () => void) => ReactNode);
  capabilities?: TemplateCapabilities;
  breadcrumbs?: TemplateBreadcrumb[];
  pageActions?: TemplateAction[];
  backAction?: { onSelect: () => void; label?: string; disabled?: boolean };
  footer?: ReactNode;
};

/** Login не требует фиктивных actor/navigation; auth действия реализует host. */
export type TemplateAdminAuthProps = TemplatePresentationBase & {
  target: "admin";
  screen: "auth";
  title?: string;
};

/** Ошибка/maintenance — самостоятельная поверхность со своими доступными действиями. */
export type TemplateAdminStatusProps = TemplatePresentationBase & {
  target: "admin";
  screen: "status";
  title?: string;
  status: "loading" | "error" | "not-found" | "forbidden" | "maintenance";
  actions?: TemplateAction[];
};

/** Frontend не принимает Admin actor/toolbar и может объявить свои page layouts. */
export type TemplateFrontendPageProps = TemplatePresentationBase & {
  target: "frontend";
  screen: "page";
  pageId: string;
  title?: string;
  navigation?: TemplateNavigationLink[];
  capabilities?: TemplateCapabilities;
  footer?: ReactNode;
};

/** Один contract, различимый по target и screen; renderer обязан обработать варианты. */
export type TemplatePresentationProps =
  | TemplateAdminWorkspaceProps
  | TemplateAdminAuthProps
  | TemplateAdminStatusProps
  | TemplateFrontendPageProps;
