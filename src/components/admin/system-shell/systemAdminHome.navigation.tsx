/**
 * @file src/components/admin/system-shell/systemAdminHome.navigation.tsx
 * @version 1.1.5
 * @date 2026-10-12
 * @description Собирает навигацию Главной и быстрые ссылки существующего reference.
 * @see documentation/architecture/system-admin-shell.md
 */

import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  History,
  House,
  Inbox,
  LayoutDashboard,
  PanelsTopLeft,
  Settings2,
  Star,
} from "lucide-react";
import type { TemplateNavigationItem as SystemAdminNavigationItem } from "@realize/template-contracts/react";

const iconProps = { size: 20, strokeWidth: 1.75, "aria-hidden": true } as const;

/** Место избранного заполняет общий shell из пользовательских preferences. */
export function getSystemAdminHomeNavigation(): SystemAdminNavigationItem {
  return {
    id: "home",
    label: "Главная",
    icon: <House {...iconProps} size={22} />,
    description: "Ваш рабочий день, важные события и быстрый доступ.",
    href: "/system",
    groups: [
      {
        id: "home-workspace",
        label: "Рабочий стол",
        items: [
          {
            id: "home-overview",
            favoriteable: false,
            label: "Обзор",
            icon: <LayoutDashboard {...iconProps} />,
            description: "Сводка рабочей среды, задачи и важные события.",
            href: "/system",
          },
          {
            id: "home-my-day",
            label: "Мой день",
            icon: <CalendarDays {...iconProps} />,
            description:
              "Ваши задачи, сроки, напоминания и приоритеты на сегодня.",
            disabled: true,
          },
        ],
      },
      {
        id: "home-attention",
        label: "Требуют внимания",
        items: [
          {
            id: "home-inbox",
            label: "Входящие",
            icon: <Inbox {...iconProps} />,
            description:
              "Уведомления, упоминания, назначения и ответы агентов.",
            disabled: true,
          },
          {
            id: "home-approvals",
            label: "Согласования",
            icon: <ClipboardCheck {...iconProps} />,
            description: "Действия и результаты, ожидающие вашего решения.",
            disabled: true,
          },
        ],
      },
      {
        id: "home-quick-access",
        label: "Быстрый доступ",
        items: [
          {
            id: "home-favorites",
            label: "Избранное",
            icon: <Star {...iconProps} />,
            description: "Закреплённые разделы, подпункты и рабочие материалы.",
            favoritesSlot: true,
          },
          {
            id: "home-recent",
            label: "Недавние",
            icon: <History {...iconProps} />,
            description:
              "Последние открытые проекты, задачи и другие материалы.",
            disabled: true,
          },
        ],
      },
      {
        id: "home-team",
        label: "Рабочая среда",
        items: [
          {
            id: "home-dashboards",
            label: "Дашборды",
            icon: <PanelsTopLeft {...iconProps} />,
            description: "Личные и командные панели показателей и виджетов.",
            disabled: true,
          },
          {
            id: "home-activity",
            label: "Лента активности",
            icon: <Activity {...iconProps} />,
            description: "Изменения в проектах, действия участников и агентов.",
            disabled: true,
          },
        ],
      },
    ],
    footerAction: {
      label: "Настроить рабочий стол",
      icon: <Settings2 size={17} aria-hidden="true" />,
      description:
        "Начальный экран, состав виджетов и плотность рабочего стола.",
      disabled: true,
    },
  };
}
