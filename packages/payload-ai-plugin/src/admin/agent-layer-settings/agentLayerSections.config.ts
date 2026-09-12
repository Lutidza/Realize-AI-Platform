/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/agentLayerSections.config.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Группирует поддержанные разделы и связывает их с едиными названиями типов записей.
 */

import {
  Blocks,
  Bot,
  BookOpen,
  FileText,
  GitBranch,
  History,
  Layers,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { AGENT_LAYER_KIND_LABELS } from "./agentLayerPresentation.util";
import type {
  AgentLayerNavigationGroup,
  AgentLayerSection,
  AgentLayerSectionDefinition,
} from "./AgentLayerWorkspace.types";

export const AGENT_LAYER_NAVIGATION: readonly AgentLayerNavigationGroup[] = [
  {
    label: "Рабочая область",
    items: [
      {
        id: "overview",
        label: "Обзор",
        description: "Состав конфигурации, состояние записей и связи.",
        icon: LayoutDashboard,
      },
      {
        id: "all",
        label: "Все записи",
        description: "Вся конфигурация выбранного черновика в одном каталоге.",
        icon: Layers,
      },
    ],
  },
  {
    label: "Агенты",
    items: [
      {
        id: "agent_profile",
        label: AGENT_LAYER_KIND_LABELS.agent_profile,
        description: "Профили, назначение и состав инструкций агентов.",
        icon: Bot,
      },
      {
        id: "local_role",
        label: AGENT_LAYER_KIND_LABELS.local_role,
        description: "Обязанности и разрешённые возможности.",
        icon: UsersRound,
      },
    ],
  },
  {
    label: "Инструкции",
    items: [
      {
        id: "skill",
        label: AGENT_LAYER_KIND_LABELS.skill,
        description: "Переиспользуемые процедуры и условия их применения.",
        icon: BookOpen,
      },
      {
        id: "local_rule",
        label: AGENT_LAYER_KIND_LABELS.local_rule,
        description: "Требования и ограничения, связанные с профилями агентов.",
        icon: ShieldCheck,
      },
      {
        id: "prompt_template",
        label: AGENT_LAYER_KIND_LABELS.prompt_template,
        description: "Шаблоны инструкций для диалога и этапов работы.",
        icon: FileText,
      },
    ],
  },
  {
    label: "Выполнение",
    items: [
      {
        id: "workflow_definition",
        label: AGENT_LAYER_KIND_LABELS.workflow_definition,
        description: "Последовательности шагов, переходы и зависимости.",
        icon: GitBranch,
      },
      {
        id: "capability_binding",
        label: AGENT_LAYER_KIND_LABELS.capability_binding,
        description:
          "Выбранные системные возможности и границы их использования.",
        icon: Blocks,
      },
      {
        id: "check_binding",
        label: AGENT_LAYER_KIND_LABELS.check_binding,
        description: "Системные проверки, включённые в конфигурацию.",
        icon: ListChecks,
      },
    ],
  },
  {
    label: "Управление",
    items: [
      {
        id: "versions",
        label: "Версии",
        description: "Доступные черновики и сохранённые выпуски конфигурации.",
        icon: History,
      },
      {
        id: "system",
        label: "Системная основа",
        description:
          "Системные возможности и проверки, доступные этой установке.",
        icon: SlidersHorizontal,
      },
    ],
  },
];

export const AGENT_LAYER_SECTIONS = Object.fromEntries(
  AGENT_LAYER_NAVIGATION.flatMap((group) => group.items).map((item) => [
    item.id,
    item,
  ]),
) as Record<AgentLayerSection, AgentLayerSectionDefinition>;
