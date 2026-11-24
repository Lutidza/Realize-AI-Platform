/**
 * @file src/components/admin/documents/readDocumentReadingScreen.service.ts
 * @version 1.0.1
 * @date 2026-11-22
 * @description Читает один документ через текущую cookie-сессию и collection ACL без передачи raw Payload в UI.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import "server-only";
import { isDocumentSlug } from "@/collections/Documents/documentIdentifiers";
import { mapDocumentReadingScreen } from "./mapDocumentReadingScreen.mapper";
import { readDocumentsBrowserActor } from "./readDocumentsBrowserActor.service";
import type { DocumentReadingScreenProps } from "./DocumentReadingScreen.types";

/** Route проверяет requireSystemAdmin; adapter повторяет native cookie auth и не обходит access rules. */
export async function readDocumentReadingScreen(
  slug: string,
): Promise<DocumentReadingScreenProps | null> {
  if (!isDocumentSlug(slug)) return null;
  const actor = await readDocumentsBrowserActor();
  if (!actor) return null;
  const { payload, user } = actor;
  const documents = await payload.find({
    collection: "documents",
    user,
    overrideAccess: false,
    depth: 0,
    limit: 1,
    pagination: false,
    where: { slug: { equals: slug } },
    select: {
      title: true,
      description: true,
      updatedAt: true,
      sections: true,
    },
  });
  return mapDocumentReadingScreen(documents.docs[0]);
}
