/**
 * @file src/utilities/preview/resolvePreviewPath.validator.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Ограничивает переход из предпросмотра внутренним путём сайта.
 */

/** Принимает путь без query/fragment, неоднозначных разделителей и обхода каталогов. */
export function resolvePreviewPath(path: string | null): string | null {
  if (!path?.startsWith("/") || path.startsWith("//")) return null;

  try {
    for (const segment of path.split("/")) {
      const decoded = decodeURIComponent(segment);
      if (
        decoded === "." ||
        decoded === ".." ||
        /[\\/?#\u0000-\u0020\u007f]/u.test(segment) ||
        /[\\/?#\u0000-\u001f\u007f]/u.test(decoded)
      )
        return null;
    }
    return path;
  } catch {
    return null;
  }
}
