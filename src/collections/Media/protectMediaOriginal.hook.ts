/**
 * @file src/collections/Media/protectMediaOriginal.hook.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Защищает неизменяемый исходник до штатной обработки upload-файла Payload.
 * @see documentation/specifications/media-management.md
 */
import { APIError, type CollectionBeforeOperationHook } from "payload";

const editableMetadata = new Set(["alt", "caption"]);

/**
 * Подключается только к коллекции immutable originals. Метаданные разрешены,
 * новая загрузка создаёт новую запись; crop/focal принадлежат рецепту использования.
 * beforeChange недостаточен: Payload к этому моменту уже обработал файл.
 */
export const protectMediaOriginal: CollectionBeforeOperationHook = ({
  args,
  collection,
  operation,
  req,
}) => {
  if (operation !== "create" && operation !== "update") return args;
  const edits = req.query?.uploadEdits;
  const data = "data" in args ? args.data : undefined;
  const hasInlineEdits =
    data &&
    [
      "crop",
      "uploadEdits",
      "focalPoint",
      "focalX",
      "focalY",
      "widthInPixels",
      "heightInPixels",
    ].some((field) => Object.hasOwn(data, field));
  const hasEdits =
    edits !== undefined &&
    (edits === null ||
      typeof edits !== "object" ||
      Array.isArray(edits) ||
      Object.keys(edits).length > 0);
  if (hasEdits || hasInlineEdits) {
    throw new APIError("Кадрирование исходного файла запрещено.", 409);
  }
  if (operation === "create") {
    if ("overwriteExistingFiles" in args && args.overwriteExistingFiles) {
      throw new APIError("Перезапись существующего файла запрещена.", 409);
    }
    if ("duplicateFromID" in args && args.duplicateFromID) {
      throw new APIError("Создайте новый исходник отдельной загрузкой.", 409);
    }
    const upload =
      typeof collection.upload === "object" ? collection.upload : undefined;
    if (
      req.file?.tempFilePath ||
      (req.file &&
        typeof req.payload.config.sharp === "function" &&
        (["image/webp", "image/avif", "image/gif"].includes(
          req.file.mimetype,
        ) ||
          upload?.resizeOptions ||
          upload?.formatOptions ||
          upload?.trimOptions ||
          upload?.constructorOptions))
    ) {
      throw new APIError(
        "Настройки загрузки не гарантируют сохранение исходных байтов.",
        409,
      );
    }
    return args;
  }
  if (
    req.file ||
    (data && Object.keys(data).some((field) => !editableMetadata.has(field)))
  ) {
    throw new APIError("Исходник неизменяем. Загрузите новый файл.", 409);
  }
  return args;
};
