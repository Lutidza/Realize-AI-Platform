/**
 * @file src/components/admin/system-shell/SystemAdminPayloadEntry.component.tsx
 * @version 2.0.0
 * @date 2026-09-25
 * @description Добавляет в Payload общие входы в самостоятельные системные разделы.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";

import { Link, NavGroup, useAuth } from "@payloadcms/ui";
import { usePathname } from "next/navigation";

import { checkRole } from "@/access/utilities";
import type { User } from "@/payload-types";
import {
  SYSTEM_TASK_MANAGER_REFERENCE_ROUTE,
  SYSTEM_WORKSHOP_ROUTE,
} from "./systemAdmin.routes";

/** Ссылка открывает самостоятельный root layout; доступ повторно проверяет сервер страницы. */
export const SystemAdminPayloadEntry = () => {
  const { user } = useAuth<User>();
  const pathname = usePathname();
  if (!checkRole(["admin"], user)) return null;

  return (
    <NavGroup isOpen label="Рабочая область">
      {[
        { href: SYSTEM_WORKSHOP_ROUTE, label: "Мастерская" },
        {
          href: SYSTEM_TASK_MANAGER_REFERENCE_ROUTE,
          label: "Задачи · прототип",
        },
      ].map(({ href, label }) => {
        const isCurrent = pathname === href || pathname?.startsWith(href + "/");
        return (
          <Link
            key={href}
            className="nav__link"
            href={href}
            prefetch={false}
            aria-current={isCurrent ? "page" : undefined}
          >
            {isCurrent ? <div className="nav__link-indicator" /> : null}
            <span className="nav__link-label">{label}</span>
          </Link>
        );
      })}
    </NavGroup>
  );
};
