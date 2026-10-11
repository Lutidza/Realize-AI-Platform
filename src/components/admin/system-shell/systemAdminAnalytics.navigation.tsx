/**
 * @file src/components/admin/system-shell/systemAdminAnalytics.navigation.tsx
 * @version 1.0.0
 * @date 2026-10-05
 * @description Подключает настоящую аналитику расходов к системной навигации; права проверяет сервер view.
 */
import { ChartNoAxesCombined } from "lucide-react";
import type { SystemAdminNavigationGroup } from "@realize/ui-kit";
import { SYSTEM_AI_ANALYTICS_ROUTE } from "./systemAdmin.routes";

export const SYSTEM_ADMIN_ANALYTICS_NAVIGATION: SystemAdminNavigationGroup[] = [
  {
    id: "analytics-ai",
    label: "Искусственный интеллект",
    items: [
      {
        id: "analytics-ai-costs",
        label: "Расходы ИИ",
        description: "Динамика расходов, модели, оптимизация и бюджеты.",
        icon: <ChartNoAxesCombined size={20} strokeWidth={1.75} aria-hidden />,
        href: SYSTEM_AI_ANALYTICS_ROUTE,
      },
    ],
  },
];
