/**
 * @file src/components/admin/access-tokens/UserAccessLink.component.tsx
 * @version 1.0.0
 * @date 2026-10-19
 * @description Открывает метаданные доступов пользователя из его карточки без показа browser JWT.
 * @see documentation/architecture/platform-access.md
 */
"use client";
import { Link, useAuth, useDocumentInfo } from "@payloadcms/ui";
import { checkRole } from "@/access/utilities";
import type { User } from "@/payload-types";
import { systemUserAccessRoute } from "../system-shell/systemAdmin.routes";

/** Сервер центра повторно проверяет ownerId; наличие ссылки не предоставляет право просмотра. */
export function UserAccessLink() {
  const { id } = useDocumentInfo();
  const { user } = useAuth<User>();
  if (!id || !checkRole(["admin"], user)) return null;
  return (
    <div>
      <h3>Доступы и токены</h3>
      <p>Подключения CLI, личные токены и доступы API этого пользователя.</p>
      <Link href={systemUserAccessRoute(String(id))} prefetch={false}>
        Открыть доступы пользователя
      </Link>
    </div>
  );
}
