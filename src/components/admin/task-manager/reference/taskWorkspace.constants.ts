/**
 * @file src/components/admin/task-manager/reference/taskWorkspace.constants.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Задаёт исходные настройки и подписи рабочих сред без состояния интерфейса.
 * @see documentation/specifications/task-management.md
 */

import { BriefcaseBusiness, Building2, Layers, Rocket } from "lucide-react";
import type {
  WorkspaceDraft,
  WorkspaceMemberRole,
} from "./taskWorkspace.types";

export const workspaceDefaults: WorkspaceDraft = {
  name: "",
  description: "",
  color: "purple",
  icon: "layers",
  timezone: "Asia/Tbilisi",
  workingDays: [1, 2, 3, 4, 5],
  visibility: "private",
};
export const workspaceColors = [
  { value: "purple", label: "Фиолетовый" },
  { value: "blue", label: "Синий" },
  { value: "green", label: "Зелёный" },
  { value: "amber", label: "Янтарный" },
  { value: "rose", label: "Розовый" },
] as const;
export const workspaceIcons = {
  layers: Layers,
  briefcase: BriefcaseBusiness,
  rocket: Rocket,
  building: Building2,
};
export const workspaceIconLabels = {
  layers: "Слои",
  briefcase: "Портфель",
  rocket: "Ракета",
  building: "Организация",
};
export const workspaceRoleLabels: Record<WorkspaceMemberRole, string> = {
  admin: "Администратор",
  member: "Участник",
  guest: "Гость",
};
export const workspaceTimezones = [
  "Asia/Tbilisi",
  "UTC",
  "Europe/Moscow",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "Asia/Almaty",
];
export const workspaceDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
