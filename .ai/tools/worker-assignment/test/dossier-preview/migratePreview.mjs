/**
 * @file .ai/tools/worker-assignment/test/dossier-preview/migratePreview.mjs
 * @version 1.0.0
 * @date 2026-11-26
 * @description Применяет штатные миграции Payload с его журналом через локальный адаптер изолированного кластера.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import { randomBytes } from "node:crypto";
import { buildConfig, getPayload } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { migrations } from "../../../../../src/migrations/index.ts";
import { pgEnvironment } from "./previewCluster.mjs";

// Адаптер принимает только фиксированный Unix-сокет. Конфигурация провайдеров приложения здесь не загружается.
const config = await buildConfig({
  secret: randomBytes(48).toString("hex"),
  telemetry: false,
  collections: [],
  db: postgresAdapter({
    push: false,
    pool: {
      host: pgEnvironment.PGHOST,
      port: Number(pgEnvironment.PGPORT),
      database: pgEnvironment.PGDATABASE,
      user: pgEnvironment.PGUSER,
      ssl: false,
    },
  }),
});
const payload = await getPayload({ config, disableOnInit: true });
try {
  await payload.db.migrate({ migrations });
} finally {
  await payload.destroy();
}
// Адаптер Payload оставляет служебное соединение reconnect в пуле. CLI завершает дочерний процесс после commit миграций.
process.exit(process.exitCode ?? 0);
