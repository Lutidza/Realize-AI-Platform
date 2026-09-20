/**
 * @file src/components/admin/task-manager/TaskManagerReferenceEntry.component.tsx
 * @version 1.0.1
 * @date 2026-09-17
 * @description Добавляет доступную администратору ссылку на прототип задач.
 * @see documentation/specifications/task-management.md
 */

"use client";

import { Link, NavGroup, useAuth } from "@payloadcms/ui";
import { usePathname } from "next/navigation";

import { checkRole } from "@/access/utilities";
import type { User } from "@/payload-types";
import { SYSTEM_TASK_MANAGER_REFERENCE_ROUTE } from "@/components/admin/system-shell/systemAdmin.routes";

/** Ссылка открывает самостоятельный root layout; доступ повторно проверяет сервер страницы. */
export const TaskManagerReferenceEntry = () => {
  const { user } = useAuth<User>();
  const pathname = usePathname();
  if (!checkRole(["admin"], user)) return null;

  const href = SYSTEM_TASK_MANAGER_REFERENCE_ROUTE;
  const isCurrent = pathname?.replace(/\/$/, "") === href.replace(/\/$/, "");

  return (
    <NavGroup isOpen label="Рабочая область">
      <Link
        className="nav__link"
        href={href}
        prefetch={false}
        aria-current={isCurrent ? "page" : undefined}
      >
        {isCurrent ? <div className="nav__link-indicator" /> : null}
        <span className="nav__link-label">Задачи · прототип</span>
      </Link>
    </NavGroup>
  );
};
