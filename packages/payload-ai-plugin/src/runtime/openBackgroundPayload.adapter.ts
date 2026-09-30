/**
 * @file packages/payload-ai-plugin/src/runtime/openBackgroundPayload.adapter.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Лениво создаёт собственный Payload instance без schema push, seed, cron и фоновых исполнителей.
 * @see documentation/specifications/design-workshop.md
 */
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Config, SanitizedConfig } from "payload";

export async function openBackgroundPayload(
  configuration: SanitizedConfig | Promise<SanitizedConfig>,
) {
  if (
    process.env.PAYLOAD_DB_PUSH === "true" ||
    process.env.PAYLOAD_DROP_DATABASE === "true"
  )
    throw new Error("Background runtime refuses schema-changing startup.");
  const { BasePayload } = await import("payload");
  const config = await configuration;
  if (config.db.name !== "postgres")
    throw new Error("Background runtime requires PostgreSQL.");
  const payload = new BasePayload();
  const destroyPayload = payload.destroy.bind(payload);
  let destroying: Promise<void> | undefined;
  // Установленный Drizzle destroy сбрасывает schema, но не закрывает принадлежащий instance pool.
  payload.destroy = () =>
    (destroying ??= (async () => {
      const pool = payload.db?.pool;
      try {
        await destroyPayload();
      } finally {
        if (pool && !pool.ending) await pool.end();
      }
    })());
  try {
    // SanitizedConfig делает необязательные Pino options обязательными в типе; runtime принимает Config logger.
    const logger: Config["logger"] = { options: { level: "silent" } };
    await payload.init({
      cron: false,
      disableOnInit: true,
      config: {
        ...config,
        onInit: () => undefined,
        logger: logger as SanitizedConfig["logger"],
        typescript: { ...config.typescript, autoGenerate: false },
        admin: {
          ...config.admin,
          importMap: { ...config.admin.importMap, autoGenerate: false },
        },
        jobs: { ...config.jobs, autoRun: [] },
        db: {
          ...config.db,
          init: (args) => {
            const adapter = config.db.init(args) as PostgresAdapter;
            adapter.push = false;
            adapter.disableCreateDatabase = true;
            adapter.prodMigrations = undefined;
            adapter.poolOptions = {
              ...adapter.poolOptions,
              connectionTimeoutMillis: 3000,
              statement_timeout: 8000,
              idle_in_transaction_session_timeout: 10000,
              max: 6,
            };
            // Заданный pool пропускает встроенный reconnect probe, удерживающий постоянный lease.
            // Background runtime использует primary и использует уже мигрированную schema, без DDL при connect.
            adapter.pool = new adapter.pg.Pool(adapter.poolOptions);
            adapter.readReplicaOptions = undefined;
            adapter.createExtensions = async () => undefined;
            return adapter;
          },
        },
      },
    });
    return payload;
  } catch {
    await payload.destroy().catch(() => undefined);
    throw new Error("Payload initialization failed.");
  }
}
