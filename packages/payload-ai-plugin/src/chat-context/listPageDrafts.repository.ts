/**
 * @file packages/payload-ai-plugin/src/chat-context/listPageDrafts.repository.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Читает ограниченный каталог страниц с правами текущего пользователя.
 */
import type { PayloadRequest } from "payload";
import type { PageDraftCatalogDTO } from "@realize/ai-contracts";

/** Возвращает только идентичность страницы; содержимое и relationships не покидают Payload. */
export const listPageDrafts = async (
  req: PayloadRequest,
  query: string,
  page: number,
): Promise<PageDraftCatalogDTO> => {
  const result = await req.payload.find({
    collection: "pages",
    depth: 0,
    draft: true,
    overrideAccess: false,
    req,
    limit: 20,
    page,
    sort: "-updatedAt",
    select: { title: true, slug: true },
    ...(query
      ? {
          where: {
            or: [{ title: { contains: query } }, { slug: { contains: query } }],
          },
        }
      : {}),
  });
  return {
    pages: result.docs.map((doc) => ({
      id: String(doc.id),
      title: doc.title,
      ...(doc.slug ? { slug: doc.slug } : {}),
    })),
    page: result.page ?? page,
    totalPages: result.totalPages,
    totalDocs: result.totalDocs,
  };
};
