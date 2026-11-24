/**
 * @file src/components/admin/documents/readDocumentList.service.ts
 * @version 1.0.0
 * @date 2026-11-22
 * @description Читает страницу списка через текущую cookie-сессию и ACL коллекции.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import "server-only";
import type { Document } from "@/payload-types";
import type { DocumentListItem, DocumentListPage } from "./DocumentList.types";
import { readDocumentsBrowserActor } from "./readDocumentsBrowserActor.service";

const PAGE_SIZE = 20;

function mapDocumentListItem(
  document: Pick<Document, "slug" | "title" | "description" | "updatedAt">,
): DocumentListItem {
  const description = document.description?.trim();
  return {
    slug: document.slug,
    title: document.title.trim(),
    ...(description ? { description } : {}),
    updatedAt: document.updatedAt,
  };
}

/** Читает только метаданные для переданной страницы. Null означает отсутствие доступа. */
export async function readDocumentList(
  page: number,
): Promise<DocumentListPage | null> {
  const actor = await readDocumentsBrowserActor();
  if (!actor) return null;
  const { payload, user } = actor;
  const result = await payload.find({
    collection: "documents",
    user,
    overrideAccess: false,
    depth: 0,
    limit: PAGE_SIZE,
    page,
    // ID стабилизирует порядок при одинаковом updatedAt.
    sort: ["-updatedAt", "-id"],
    select: {
      slug: true,
      title: true,
      description: true,
      updatedAt: true,
    },
  });
  return {
    items: result.docs.map(mapDocumentListItem),
    page,
    totalPages: Math.max(1, result.totalPages),
  };
}
