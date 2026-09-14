/**
 * @file packages/payload-ai-plugin/src/endpoints/pageKnowledgeReferences.repository.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет доступ к связанным формам, не извлекая их содержимое в контекст агента.
 */
import type { PayloadRequest } from "payload";

/** Только существование разрешённой записи; ошибки хранилища не маскируются как отказ доступа. */
export const canReadPageFormReference = async (
  req: PayloadRequest,
  id: string,
): Promise<boolean> => {
  if (!req.payload.collections.forms) return false;
  const recordID = req.payload.db.defaultIDType === "text" ? id : Number(id);
  if (
    typeof recordID === "number" &&
    (!Number.isSafeInteger(recordID) || recordID < 1)
  )
    return false;
  try {
    const record = await req.payload.findByID({
      collection: "forms",
      id: recordID,
      depth: 0,
      // Payload всегда включает id; один служебный timestamp задаёт include-проекцию.
      select: { updatedAt: true },
      overrideAccess: false,
      req,
    });
    return record != null && String(record.id) === id;
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 403 || status === 404) return false;
    throw error;
  }
};
