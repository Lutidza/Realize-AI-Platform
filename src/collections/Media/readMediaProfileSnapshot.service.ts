/**
 * @file src/collections/Media/readMediaProfileSnapshot.service.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Читает один доступный native снимок профиля для неизменяемого задания обработки.
 */

import { APIError } from "payload";
import { checkRole } from "@/access/utilities";
import type {
  MediaProfileSnapshot,
  ReadMediaProfileSnapshotInput,
} from "./MediaProfile.types";
import { mapMediaProfileRecipe } from "./mapMediaProfileRecipe.mapper";

export async function readMediaProfileSnapshot({
  payload,
  req,
  profileID,
}: ReadMediaProfileSnapshotInput): Promise<MediaProfileSnapshot> {
  if (!checkRole(["admin"], req.user)) {
    throw new APIError(
      "Настройка обработки доступна только администратору.",
      403,
    );
  }
  // Проверяет существование родителя и обычный read ACL; рецепт берётся только из version.
  const parent = await payload.findByID({
    collection: "media-profiles",
    id: profileID,
    depth: 0,
    overrideAccess: false,
    req,
  });
  const result = await payload.findVersions({
    collection: "media-profiles",
    where: { parent: { equals: parent.id } },
    sort: "-id",
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: false,
    req,
  });
  const snapshot = result.docs[0];
  if (
    !snapshot ||
    !Number.isSafeInteger(snapshot.id) ||
    Number(snapshot.id) < 1 ||
    String(snapshot.parent) !== String(parent.id)
  ) {
    throw new APIError(
      "Сохранённая версия профиля недоступна. Сохраните профиль повторно.",
      409,
    );
  }
  const version = snapshot.version;
  if (version.enabled !== true) {
    throw new APIError(
      "Этот профиль отключён. Выберите доступный профиль.",
      409,
    );
  }
  if (
    typeof version.name !== "string" ||
    !version.name.trim() ||
    version.name.length > 160
  ) {
    throw new APIError(
      "В сохранённой версии отсутствует название профиля.",
      409,
    );
  }
  try {
    return Object.freeze({
      profileID: parent.id,
      profileVersionID: Number(snapshot.id),
      profileName: version.name,
      recipe: mapMediaProfileRecipe(version, Number(snapshot.id)),
    });
  } catch {
    throw new APIError(
      "Сохранённая версия профиля содержит некорректные настройки.",
      409,
    );
  }
}
