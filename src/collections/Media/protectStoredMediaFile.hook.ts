/**
 * @file src/collections/Media/protectStoredMediaFile.hook.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Проверяет неизменяемые native Media до файловой обработки, включая Local API.
 * @see documentation/specifications/media-management.md
 */
import { createHash } from "node:crypto";
import { APIError, type CollectionBeforeOperationHook } from "payload";
import { isMediaProcessingInternal } from "./mediaFileAccess.policy";

const fileEdits = [
  "crop",
  "uploadEdits",
  "focalPoint",
  "focalX",
  "focalY",
  "widthInPixels",
  "heightInPixels",
];

/** overrideAccess не отключает hook: любой update запрещён, cleanup требует server context. */
export const protectStoredMediaFile: CollectionBeforeOperationHook = ({
  args,
  collection,
  operation,
  req,
}) => {
  if (!["create", "update", "delete"].includes(operation)) return args;
  if (!isMediaProcessingInternal(req)) {
    throw new APIError(
      "Файлы обработки изменяет только серверный сервис.",
      403,
    );
  }
  if (operation === "update") {
    throw new APIError("Сохранённый файл и его описание неизменяемы.", 409);
  }
  if (operation === "delete") return args;

  const incomingData = "data" in args ? args.data : undefined;
  const data =
    incomingData &&
    typeof incomingData === "object" &&
    !Array.isArray(incomingData)
      ? (incomingData as Record<string, unknown>)
      : undefined;
  const edits = req.query?.uploadEdits;
  if (
    (edits !== undefined &&
      (edits === null ||
        typeof edits !== "object" ||
        Array.isArray(edits) ||
        Object.keys(edits).length > 0)) ||
    (data && fileEdits.some((field) => Object.hasOwn(data, field))) ||
    ("overwriteExistingFiles" in args && args.overwriteExistingFiles) ||
    ("duplicateFromID" in args && args.duplicateFromID !== undefined)
  ) {
    throw new APIError(
      "Изменение или перезапись исходных байтов запрещены.",
      409,
    );
  }

  const upload = typeof collection.upload === "object" && collection.upload;
  if (
    typeof req.payload.config.sharp === "function" ||
    !upload ||
    upload.crop !== false ||
    upload.focalPoint !== false ||
    upload.resizeOptions ||
    upload.formatOptions ||
    upload.trimOptions ||
    upload.constructorOptions ||
    upload.imageSizes?.length
  ) {
    throw new APIError("Настройки upload не сохраняют исходные байты.", 409);
  }

  const original = collection.slug === "media-originals";
  const hashField = original ? "sourceHash" : "contentHash";
  const expectedHash = data?.[hashField];
  const maximumBytes = (original ? 25 : 64) * 1024 * 1024;
  const file = req.file;
  if (
    !file ||
    file.tempFilePath ||
    !Buffer.isBuffer(file.data) ||
    file.data.length < 1 ||
    file.data.length > maximumBytes ||
    file.size !== file.data.length ||
    typeof expectedHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(expectedHash) ||
    createHash("sha256").update(file.data).digest("hex") !== expectedHash
  ) {
    throw new APIError("Размер или контрольная сумма файла не совпадают.", 409);
  }
  return args;
};
