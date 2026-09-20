/**
 * @file src/components/admin/task-manager/reference/taskContainerAvatar.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Проверяет локальный avatar и нормализует загруженное изображение для demo store.
 * @see documentation/specifications/task-management.md
 */

/** Команда принимает только локальную растровую картинку; внешние URL не входят в этот контракт. */
export function isTaskContainerAvatar(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 512_000 &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

/** 128px thumbnail ограничивает память reference; исходный файл никуда не отправляется. */
export async function readTaskContainerAvatar(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Выберите PNG, JPEG или WebP.");
  if (file.size > 2 * 1024 * 1024)
    throw new Error("Размер изображения — не более 2 МБ.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Не удалось подготовить изображение.");
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      128,
      128,
    );
    return canvas.toDataURL("image/webp", 0.9);
  } finally {
    bitmap.close();
  }
}
