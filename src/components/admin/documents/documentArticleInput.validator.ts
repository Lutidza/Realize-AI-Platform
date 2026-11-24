/**
 * @file src/components/admin/documents/documentArticleInput.validator.ts
 * @version 1.0.0
 * @date 2026-11-23
 * @description Проверяет данные формы статьи и возвращает адресные сообщения для полей.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { z } from "zod";
import { isDocumentSlug } from "@/collections/Documents/documentIdentifiers";
import type {
  DocumentArticleFieldErrors,
  DocumentArticleInput,
} from "./DocumentArticleForm.types";

const title = z
  .string({ error: "Введите заголовок." })
  .max(160, "Заголовок должен содержать не более 160 символов.")
  .trim()
  .min(1, "Введите заголовок.");
const identifier = z
  .string({ error: "Введите адрес." })
  .refine(
    isDocumentSlug,
    "Введите адрес из строчных латинских букв, цифр и одиночных дефисов, до 128 символов.",
  );
const paragraph = z.object({
  text: z
    .string({ error: "Введите текст абзаца." })
    .refine((value) => value.trim().length > 0, "Введите текст абзаца."),
});
const section = z.object({
  title,
  anchor: identifier,
  paragraphs: z
    .array(paragraph, { error: "Добавьте абзац." })
    .min(1, "Добавьте хотя бы один абзац."),
});

const article = z
  .object({
    title,
    slug: identifier,
    description: z
      .string({ error: "Введите текст краткого описания." })
      .max(1000, "Описание должно содержать не более 1000 символов.")
      .trim(),
    sections: z
      .array(section, { error: "Добавьте раздел." })
      .min(1, "Добавьте хотя бы один раздел."),
  })
  .superRefine(({ sections }, context) => {
    const anchors = new Set<string>();
    for (const [index, { anchor }] of sections.entries()) {
      if (!isDocumentSlug(anchor)) continue;
      if (anchors.has(anchor)) {
        context.addIssue({
          code: "custom",
          message: "Такой адрес раздела уже используется в статье.",
          path: ["sections", index, "anchor"],
        });
      }
      anchors.add(anchor);
    }
  });

/** Проверяет границу Server Action; схема Payload повторно валидирует запись. */
export function validateDocumentArticleInput(
  input: unknown,
): { input: DocumentArticleInput } | { fields: DocumentArticleFieldErrors } {
  const parsed = article.safeParse(input);
  if (parsed.success) return { input: parsed.data };

  const fields: DocumentArticleFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".") || "form";
    fields[path] ??= issue.path.length
      ? issue.message
      : "Проверьте данные статьи.";
  }
  return { fields };
}
