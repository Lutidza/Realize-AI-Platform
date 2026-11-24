/**
 * @file src/components/admin/documents/suggestDocumentIdentifier.util.ts
 * @version 1.0.0
 * @date 2026-11-23
 * @description Предлагает общие значения slug и anchor из заголовков статьи и разделов.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */

const cyrillic: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  ґ: "g",
  є: "ye",
  і: "i",
  ї: "yi",
  ў: "u",
};

/** Пустой результат оставляет адрес для ручного заполнения. */
export function suggestDocumentIdentifier(title: string): string {
  return Array.from(
    title.normalize("NFKC").toLowerCase(),
    (character) => cyrillic[character] ?? character,
  )
    .join("")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128)
    .replace(/-$/g, "");
}
