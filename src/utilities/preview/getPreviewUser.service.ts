/**
 * @file src/utilities/preview/getPreviewUser.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет действующую сессию администратора для предпросмотра.
 */

import type { Payload } from "payload";
import { checkRole } from "@/access/utilities";

/** Cookie preview и секрет ссылки не заменяют проверку текущего пользователя. */
export async function getPreviewUser(
  payload: Payload,
  requestHeaders: Headers,
) {
  try {
    const { user } = await payload.auth({ headers: requestHeaders });
    return user?.collection === "users" && checkRole(["admin"], user)
      ? user
      : null;
  } catch {
    // Ошибка проверки сессии закрывает доступ; заголовки и токен не журналируются.
    payload.logger.warn("Не удалось проверить сессию предпросмотра");
    return null;
  }
}
