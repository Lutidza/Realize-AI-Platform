/**
 * @file services/ai-execution-worker/src/design-workshop/designPreviewStorageRoot.config.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Отделяет staging разных установок по несекретной идентичности PostgreSQL.
 * @see documentation/specifications/design-workshop.md
 */
import { join } from "node:path";
import { hashCanonicalJSON } from "@realize/change-engine";
export function designPreviewStorageRoot(
  previewRoot: string,
  databaseURL: string,
): string {
  const database = new URL(databaseURL);
  const binding = hashCanonicalJSON({
    host: database.hostname,
    port: database.port || "5432",
    database: database.pathname,
  });
  return join(previewRoot, "workshop-capture", binding);
}
