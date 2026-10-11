/**
 * @file src/components/admin/system-shell/systemAdmin.navigation.tsx
 * @version 1.9.0
 * @date 2026-10-05
 * @description Задаёт порядок, названия, иконки и доступные переходы общей навигации Realize.
 * @see documentation/architecture/system-admin-shell.md
 */

import {
  BookOpenText,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesCombined,
  ListTodo,
  Megaphone,
  Newspaper,
  PackagePlus,
  PanelsTopLeft,
  Plug,
  Settings2,
  Sparkles,
  Store,
  Users,
  WandSparkles,
  Wrench,
} from "lucide-react";
import type { SystemAdminNavigationItem } from "@realize/ui-kit";
import type { SystemAdminNavigationOptions } from "./systemAdminNavigation.types";
import { SYSTEM_ADMIN_AI_NAVIGATION } from "./systemAdminAI.navigation";
import { getSystemAdminHomeNavigation } from "./systemAdminHome.navigation";
import {
  SYSTEM_WORKSHOP_ROUTE,
  SYSTEM_AI_ANALYTICS_ROUTE,
} from "./systemAdmin.routes";
import { SYSTEM_ADMIN_ANALYTICS_NAVIGATION } from "./systemAdminAnalytics.navigation";
import { SYSTEM_ADMIN_WORKSHOP_NAVIGATION } from "./systemAdminWorkshop.navigation";

const iconProps = { size: 22, strokeWidth: 1.75, "aria-hidden": true } as const;

/**
 * Единый host-каталог для системной оболочки. Пункты без href/onSelect открывают
 * только панель раздела; отсутствие подпунктов не заменяется фиктивными страницами.
 */
export function getSystemAdminNavigation({
  onTasks,
  tasksFavoriteLinks,
  tasksPanel,
}: SystemAdminNavigationOptions): SystemAdminNavigationItem[] {
  return [
    getSystemAdminHomeNavigation(),
    {
      id: "ai",
      label: "AI",
      icon: <Sparkles {...iconProps} />,
      description: "Ассистент, агенты и управление выполнением.",
      href: "/admin/ai",
      groups: SYSTEM_ADMIN_AI_NAVIGATION,
    },
    {
      id: "tasks",
      label: "Задачи",
      icon: <ListTodo {...iconProps} />,
      description: "Рабочие среды, проекты и задачи команды.",
      onSelect: onTasks,
      panel: tasksPanel,
      favoriteLinks: tasksFavoriteLinks,
    },
    {
      id: "planner",
      hiddenByDefault: true,
      label: "Планер",
      icon: <CalendarDays {...iconProps} />,
      description: "Планирование сроков, событий и загрузки.",
    },
    {
      id: "crm",
      label: "CRM",
      icon: <BriefcaseBusiness {...iconProps} />,
      description: "Клиенты, контакты и отношения с ними.",
    },
    {
      id: "store",
      label: "Магазин",
      icon: <Store {...iconProps} />,
      description: "Товары, заказы и операции магазина.",
    },
    {
      id: "content",
      label: "Контент",
      icon: <Newspaper {...iconProps} />,
      description: "Страницы, публикации и медиаматериалы.",
    },
    {
      id: "marketing",
      label: "Маркетинг",
      icon: <Megaphone {...iconProps} />,
      description: "Кампании, продвижение и коммуникации.",
    },
    {
      id: "analytics",
      label: "Аналитика",
      icon: <ChartNoAxesCombined {...iconProps} />,
      description: "Отчёты, показатели и результаты работы.",
      href: SYSTEM_AI_ANALYTICS_ROUTE,
      groups: SYSTEM_ADMIN_ANALYTICS_NAVIGATION,
    },
    {
      id: "themes",
      label: "Темы и шаблоны",
      icon: <PanelsTopLeft {...iconProps} />,
      description: "Оформление сайта и повторно используемые шаблоны.",
    },
    {
      id: "workshop",
      label: "Мастерская",
      icon: <WandSparkles {...iconProps} />,
      description: "Дизайн-проекты, брифы, материалы и версии макетов.",
      href: SYSTEM_WORKSHOP_ROUTE,
      groups: SYSTEM_ADMIN_WORKSHOP_NAVIGATION,
    },
    {
      id: "tools",
      hiddenByDefault: true,
      label: "Инструменты",
      icon: <Wrench {...iconProps} />,
      description: "Служебные инструменты для работы с проектом.",
    },
    {
      id: "extensions",
      label: "Плагины и пакеты",
      icon: <PackagePlus {...iconProps} />,
      description: "Расширения и пакеты возможностей проекта.",
    },
    {
      id: "integrations",
      label: "Интеграции",
      icon: <Plug {...iconProps} />,
      description: "Подключения внешних сервисов и провайдеров.",
      href: "/admin/integrations",
    },
    {
      id: "users",
      label: "Пользователи",
      icon: <Users {...iconProps} />,
      description: "Участники, учётные записи и права доступа.",
      href: "/admin/collections/users",
    },
    {
      id: "settings",
      label: "Настройки системы",
      icon: <Settings2 {...iconProps} />,
      description: "Общие параметры системы и рабочей среды.",
    },
    {
      id: "documentation",
      label: "Документация",
      icon: <BookOpenText {...iconProps} />,
      description: "Руководства и справочные материалы по работе с системой.",
    },
  ];
}
