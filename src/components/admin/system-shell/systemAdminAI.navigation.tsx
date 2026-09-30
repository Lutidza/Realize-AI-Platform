/**
 * @file src/components/admin/system-shell/systemAdminAI.navigation.tsx
 * @version 1.2.0
 * @date 2026-09-27
 * @description Задаёт группы AI, существующие переходы и планируемые подпункты системного reference.
 * @see documentation/architecture/system-admin-shell.md
 */

import {
  BookOpen,
  Bot,
  Cpu,
  Files,
  FlaskConical,
  Gauge,
  GitBranch,
  Layers,
  LayoutDashboard,
  ListOrdered,
  MessageCircle,
  MessagesSquare,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { SystemAdminNavigationGroup } from "@realize/ui-kit";

const iconProps = { size: 20, strokeWidth: 1.75, "aria-hidden": true } as const;
const planned = { disabled: true } as const;

/** Host задаёт состав групп и маршруты доступных разделов reference. */
export const SYSTEM_ADMIN_AI_NAVIGATION: SystemAdminNavigationGroup[] = [
  {
    id: "workspace",
    label: "Рабочая среда",
    items: [
      {
        id: "ai-overview",
        label: "Обзор AI",
        icon: <LayoutDashboard {...iconProps} />,
        description: "Активные агенты, задания и действия, требующие внимания.",
        ...planned,
      },
      {
        id: "ai-assistant",
        label: "AI-ассистент",
        icon: <MessageCircle {...iconProps} />,
        description:
          "Общение с ассистентом, контекст, выбор профиля и процесса.",
        href: "/admin/ai",
      },
      {
        id: "ai-conversations",
        label: "Диалоги",
        icon: <MessagesSquare {...iconProps} />,
        description: "Каталог диалогов, поиск, избранное и связи с задачами.",
        ...planned,
      },
    ],
  },
  {
    id: "agents-knowledge",
    label: "Агенты и знания",
    items: [
      {
        id: "ai-agents",
        label: "Агенты",
        icon: <Bot {...iconProps} />,
        description:
          "Исполнители, специализации, загрузка, команды и делегирование.",
        ...planned,
      },
      {
        id: "ai-knowledge",
        label: "База знаний",
        icon: <BookOpen {...iconProps} />,
        description:
          "Документы, источники контекста и доступ агентов к знаниям.",
        ...planned,
      },
      {
        id: "ai-artifacts",
        label: "Результаты работы",
        icon: <Files {...iconProps} />,
        description:
          "Референсы, документы и файлы, связанные с задачами и запусками.",
        ...planned,
      },
    ],
  },
  {
    id: "execution",
    label: "Выполнение",
    items: [
      {
        id: "ai-runs",
        label: "Запуски процессов",
        icon: <GitBranch {...iconProps} />,
        description:
          "Этапы выполнения процессов, результаты, ошибки и история.",
        href: "/admin/ai/runs",
      },
      {
        id: "ai-queue",
        label: "Очередь выполнения",
        icon: <ListOrdered {...iconProps} />,
        description:
          "Приоритеты заданий, зависимости и параллельное выполнение.",
        ...planned,
      },
      {
        id: "ai-approvals",
        label: "Согласования",
        icon: <ShieldCheck {...iconProps} />,
        description:
          "Подтверждения действий, приёмка результатов и ожидаемые решения.",
        ...planned,
      },
    ],
  },
  {
    id: "configuration",
    label: "Конфигурация",
    items: [
      {
        id: "ai-agent-layer",
        favoriteable: false,
        label: "Агентский слой",
        icon: <Layers {...iconProps} />,
        description:
          "Профили, роли, инструкции, процессы и версии конфигурации.",
        href: "/admin/ai/settings",
      },
      {
        id: "ai-models",
        label: "Модели и провайдеры",
        icon: <Cpu {...iconProps} />,
        description: "Доступные модели, их назначение и состояние подключений.",
        ...planned,
      },
      {
        id: "ai-settings",
        label: "Настройки AI",
        icon: <Settings2 {...iconProps} />,
        description: "Значения по умолчанию, уведомления и хранение истории.",
        ...planned,
      },
    ],
  },
  {
    id: "quality",
    label: "Контроль и качество",
    items: [
      {
        id: "ai-search-observations",
        label: "Диагностика поиска",
        icon: <Search {...iconProps} />,
        description: "Скорость, ограничения и история поиска файлов и кода.",
        href: "/admin/ai/search",
      },
      {
        id: "ai-events",
        label: "Журнал событий",
        icon: <ScrollText {...iconProps} />,
        description:
          "Действия агентов и пользователей, изменения и технические события.",
        ...planned,
      },
      {
        id: "ai-usage",
        label: "Использование и лимиты",
        icon: <Gauge {...iconProps} />,
        description: "Токены, стоимость, квоты и ограничения использования.",
        ...planned,
      },
      {
        id: "ai-evaluations",
        label: "Проверка качества",
        icon: <FlaskConical {...iconProps} />,
        description:
          "Проверочные сценарии, оценка результатов и сравнение версий.",
        ...planned,
      },
    ],
  },
];
