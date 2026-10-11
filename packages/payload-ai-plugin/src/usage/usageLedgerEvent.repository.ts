/**
 * @file packages/payload-ai-plugin/src/usage/usageLedgerEvent.repository.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Сохраняет append-only evidence и отклоняет повтор ключа с другим содержимым.
 */
import { hashCanonicalJSON } from "@realize/change-engine";
import type { UsageTransaction } from "./UsageStore.types";

/** Возвращает false только для точного replay; вызывается внутри общей ledger transaction. */
export async function appendUsageEvent(
  client: UsageTransaction,
  eventId: string,
  subjectKey: string,
  kind: string,
  event: unknown,
): Promise<boolean> {
  const contentHash = hashCanonicalJSON({ subjectKey, kind, event });
  const existing = await client.query<{ content_hash: string }>(
    "SELECT content_hash FROM realize_ai_usage_events WHERE event_id=$1",
    [eventId],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].content_hash !== contentHash)
      throw new Error("USAGE_EVENT_CONFLICT");
    return false;
  }
  await client.query(
    "INSERT INTO realize_ai_usage_events(event_id,subject_key,kind,event,content_hash,created_at,updated_at) VALUES($1,$2,$3,$4::jsonb,$5,now(),now())",
    [eventId, subjectKey, kind, JSON.stringify(event), contentHash],
  );
  return true;
}
