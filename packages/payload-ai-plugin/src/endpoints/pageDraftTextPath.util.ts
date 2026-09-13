/**
 * @file packages/payload-ai-plugin/src/endpoints/pageDraftTextPath.util.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Разбирает только безопасные JSON Pointer адреса уже разрешённых host-полей.
 */
import { EndpointError } from "./http";

/** Проверка синтаксиса дополняет обязательное совпадение с host projection. */
export const pageDraftTextPath = (path: string): string[] => {
  const parts = path
    .split("/")
    .slice(1)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (
    !path.startsWith("/") ||
    !parts.length ||
    parts.some(
      (part) =>
        !part || ["__proto__", "constructor", "prototype"].includes(part),
    )
  )
    throw new EndpointError(
      "INVALID_REQUEST",
      "Адрес текстового поля недопустим.",
      400,
    );
  return parts;
};
