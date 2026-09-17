/**
 * @file src/collections/Media/prepareMediaUpload.hook.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Проверяет native Media mutation и готовит очищенную копию новой загрузки.
 * @see documentation/specifications/media-management.md
 */
import path from "node:path";
import { APIError, type CollectionBeforeOperationHook } from "payload";
import { checkRole } from "@/access/utilities";
import type { Media } from "@/payload-types";
import { prepareMediaDisplayCopy } from "./prepareMediaDisplayCopy.service";
import { lockMediaTransaction } from "./lockMediaTransaction.repository";
import { pendingSources, supportedImages } from "./mediaUploadSource.context";

const protectedFields = [
  "original",
  "managedDisplay",
  "filename",
  "mimeType",
  "filesize",
  "width",
  "height",
  "url",
  "thumbnailURL",
  "focalX",
  "focalY",
];

/** beforeOperation предшествует native access: авторизация обязательна до Sharp и файлов. */
export const prepareMediaUpload: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  if (
    !["create", "update"].includes(operation) ||
    req.context.mediaProcessingInternal === true
  )
    return args;
  if (!req.user || !checkRole(["admin"], req.user))
    throw new APIError("Необходим доступ администратора.", 403);
  const data =
    "data" in args && args.data && typeof args.data === "object"
      ? (args.data as Record<string, unknown>)
      : undefined;
  if (
    (req.query?.uploadEdits && Object.keys(req.query.uploadEdits).length) ||
    (data &&
      [
        "crop",
        "uploadEdits",
        "focalPoint",
        "widthInPixels",
        "heightInPixels",
      ].some((key) => data[key] != null))
  ) {
    throw new APIError(
      "Исходник неизменяем. Загрузите новый файл для другого кадра.",
      409,
    );
  }
  if (operation === "update") {
    if (req.file)
      throw new APIError("Замену файла выполняйте новой загрузкой.", 409);
    if (
      data &&
      "id" in args &&
      (typeof args.id === "number" || typeof args.id === "string")
    ) {
      // Тот же порядок lock → native write используется queue/retry/delete одного Media.
      await lockMediaTransaction(req, Number(args.id));
      const saved = await req.payload.findByID({
        collection: "media",
        id: args.id,
        req,
        depth: 0,
        overrideAccess: false,
      });
      for (const field of protectedFields) {
        const current = saved[field as keyof Media];
        if (
          Object.hasOwn(data, field) &&
          JSON.stringify(data[field] ?? null) !==
            JSON.stringify(current ?? null)
        ) {
          throw new APIError("Технические поля файла неизменяемы.", 409);
        }
      }
    } else if (
      data &&
      [...protectedFields, "processingProfile"].some((field) =>
        Object.hasOwn(data, field),
      )
    ) {
      // Native bulk ловит afterChange ошибки отдельных документов и может сохранить их записи.
      throw new APIError(
        "Профиль и файловые поля меняются только в карточке отдельного файла.",
        409,
      );
    }
    return args;
  }
  if (
    ("overwriteExistingFiles" in args && args.overwriteExistingFiles) ||
    ("duplicateFromID" in args && args.duplicateFromID)
  ) {
    throw new APIError("Создайте новый материал штатной загрузкой файла.", 409);
  }
  if (data) {
    delete data.original;
    delete data.managedDisplay;
  }
  const file = req.file;
  if (!file) return args;
  if (!supportedImages.includes(file.mimetype)) {
    if (data?.processingProfile)
      throw new APIError("Профиль применяется только к JPEG, PNG и WebP.", 400);
    return args;
  }
  if (!Buffer.isBuffer(file.data) || file.tempFilePath)
    throw new APIError("Требуется обычная загрузка файла в буфер.", 400);
  const source = Buffer.from(file.data);
  const display = await prepareMediaDisplayCopy(source);
  pendingSources.set(req, {
    data: source,
    name: path.basename(file.name),
    mimetype: display.sourceMimeType,
  });
  const name = `${path.parse(file.name).name}-display.webp`;
  req.file = {
    data: display.data,
    name,
    mimetype: "image/webp",
    size: display.data.length,
  };
  if (data) data.managedDisplay = true;
  return args;
};
