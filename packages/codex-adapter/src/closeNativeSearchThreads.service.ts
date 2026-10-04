/**
 * @file packages/codex-adapter/src/closeNativeSearchThreads.service.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Проверяет завершение реальных native descendants и архивирует их перед закрытием процесса run.
 * @see documentation/architecture/codex-integration.md
 */
import type { JsonLineRPCClient } from "./JsonLineRpcClient.adapter";
import { codexRecord } from "./codexRecord.util";

/** Изолированный parent принадлежит run; IDs берутся из RPC, а не ответа модели. */
export async function closeNativeSearchThreads(
  client: JsonLineRPCClient,
  parentID: string,
): Promise<number> {
  const result = await client.request<{
    data: unknown[];
    nextCursor?: string | null;
  }>("thread/list", { ancestorThreadId: parentID, limit: 5 });
  if (
    !Array.isArray(result.data) ||
    result.nextCursor ||
    result.data.length > 4
  )
    throw new Error("codex_search_child_limit");
  const ids = result.data.map((value) => {
    const child = codexRecord(value);
    if (
      !child ||
      child.parentThreadId !== parentID ||
      typeof child.id !== "string" ||
      !child.id ||
      child.id === parentID ||
      !["idle", "notLoaded"].includes(String(codexRecord(child.status)?.type))
    )
      throw new Error("codex_search_child_not_finished");
    return child.id;
  });
  if (new Set(ids).size !== ids.length)
    throw new Error("codex_search_child_limit");
  for (const id of ids)
    await client.request("thread/archive", { threadId: id });
  return result.data.length;
}
