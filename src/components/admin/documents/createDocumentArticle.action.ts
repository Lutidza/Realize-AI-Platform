/**
 * @file src/components/admin/documents/createDocumentArticle.action.ts
 * @version 1.1.1
 * @date 2026-11-24
 * @description Создаёт статью от имени администратора и проверяет неизвестный результат записи.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
"use server";

import { revalidatePath } from "next/cache";
import { Forbidden, ValidationError } from "payload";
import { z } from "zod";
import { isDocumentSlug } from "@/collections/Documents/documentIdentifiers";
import type {
  CheckCreatedDocumentArticleResult,
  CreateDocumentArticleResult,
  DocumentArticleFieldErrors,
  DocumentArticleInput,
} from "./DocumentArticleForm.types";
import { validateDocumentArticleInput } from "./documentArticleInput.validator";
import { documentRoute } from "./documentRoutes.util";
import { readDocumentsBrowserActor } from "./readDocumentsBrowserActor.service";

const slugInUse = "Этот адрес статьи уже используется.";
const knownField =
  /^(?:title|slug|description|sections(?:\.\d+(?:\.(?:title|anchor|paragraphs(?:\.\d+\.text)?))?)?)$/;

// В production адаптер и Server Action могут использовать разные экземпляры класса Payload.
const documentValidationError = z.object({
  status: z.literal(400),
  isOperational: z.literal(true),
  data: z.object({
    collection: z.literal("documents"),
    errors: z.array(z.object({ path: z.string(), message: z.string() })).min(1),
  }),
});

function validationFields(error: unknown): DocumentArticleFieldErrors | null {
  const data =
    error instanceof ValidationError
      ? error.data
      : documentValidationError.safeParse(error).data?.data;
  if (!data) return null;
  const fields: DocumentArticleFieldErrors = {};
  for (const { path } of data.errors) {
    if (!knownField.test(path)) continue;
    fields[path] ??= path === "slug" ? slugInUse : "Проверьте это поле.";
  }
  if (Object.keys(fields).length === 0)
    fields.form = "Проверьте данные статьи.";
  return fields;
}

function isSlugConstraint(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const cause = "cause" in error ? error.cause : error;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "23505" &&
    "constraint" in cause &&
    cause.constraint === "documents_slug_idx"
  );
}

function refreshDocumentPaths(slug: string) {
  revalidatePath(documentRoute(1, {}));
  revalidatePath(documentRoute(1, {}, slug));
}

/** Payload в одной операции проверяет ACL, валидирует запись и сохраняет вложенные строки. */
export async function createDocumentArticleAction(
  draft: DocumentArticleInput,
): Promise<CreateDocumentArticleResult> {
  try {
    const actor = await readDocumentsBrowserActor();
    if (!actor) return { status: "forbidden" };
    const parsed = validateDocumentArticleInput(draft);
    if ("fields" in parsed) return { status: "invalid", fields: parsed.fields };

    const article = await actor.payload.create({
      collection: "documents",
      user: actor.user,
      overrideAccess: false,
      depth: 0,
      data: parsed.input,
      select: { slug: true },
    });
    refreshDocumentPaths(article.slug);
    return { status: "created", slug: article.slug };
  } catch (error) {
    if (error instanceof Forbidden) return { status: "forbidden" };
    const fields = validationFields(error);
    if (fields) return { status: "invalid", fields };
    if (isSlugConstraint(error)) {
      return { status: "invalid", fields: { slug: slugInUse } };
    }
    return { status: "uncertain" };
  }
}

/** Проверка отправляет только slug. Браузер сравнивает полученные поля с отправленным черновиком. */
export async function checkCreatedDocumentArticleAction(
  slug: string,
): Promise<CheckCreatedDocumentArticleResult> {
  try {
    const actor = await readDocumentsBrowserActor();
    if (!actor) return { status: "forbidden" };
    if (!isDocumentSlug(slug)) return { status: "unavailable" };

    const { docs } = await actor.payload.find({
      collection: "documents",
      user: actor.user,
      overrideAccess: false,
      depth: 0,
      limit: 1,
      pagination: false,
      where: { slug: { equals: slug } },
      select: {
        slug: true,
        title: true,
        description: true,
        sections: { title: true, anchor: true, paragraphs: { text: true } },
      },
    });
    const article = docs[0];
    if (!article) return { status: "missing" };
    refreshDocumentPaths(slug);
    return {
      status: "found",
      article: {
        slug: article.slug,
        title: article.title,
        description: article.description ?? "",
        sections: article.sections.map(({ title, anchor, paragraphs }) => ({
          title,
          anchor,
          paragraphs: paragraphs.map(({ text }) => ({ text })),
        })),
      },
    };
  } catch (error) {
    return { status: error instanceof Forbidden ? "forbidden" : "unavailable" };
  }
}
