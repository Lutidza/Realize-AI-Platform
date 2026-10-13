/**
 * @file tests/e2e/support/taskManagerAcceptance/normalizeFixtureDatabaseSource.config.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Закрепляет loopback PostgreSQL target без query-переопределения transport host.
 * @see documentation/specifications/task-management-execution.md
 */
/** pg query host имеет приоритет над URL.hostname; проверка применяется до любого Client. */
export function normalizeFixtureDatabaseSource(source: URL): URL {
  if (
    !["postgres:", "postgresql:"].includes(source.protocol) ||
    !["localhost", "127.0.0.1"].includes(source.hostname) ||
    [...source.searchParams.keys()].some((key) =>
      ["host", "hostaddr"].includes(key.toLowerCase()),
    )
  )
    throw new Error("TASK_BROWSER_DATABASE_NOT_LOOPBACK");
  const normalized = new URL(source);
  normalized.hostname = "127.0.0.1";
  return normalized;
}
