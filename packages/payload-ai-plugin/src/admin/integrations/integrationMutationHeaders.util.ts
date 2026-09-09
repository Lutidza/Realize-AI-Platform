/**
 * @file packages/payload-ai-plugin/src/admin/integrations/integrationMutationHeaders.util.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Создаёт отдельный ключ идемпотентности для операции интеграции.
 */

/** Новый пользовательский запрос получает собственный ключ в общем пространстве интеграций. */
export const integrationMutationHeaders = (): HeadersInit => ({
  "Idempotency-Key": `integration:${crypto.randomUUID()}`,
});
