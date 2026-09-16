/**
 * @file tests/int/support/mediaArchitecture/createMediaArchitecturePool.adapter.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Учитывает публичные аренды своего pg.Pool для завершения изолированного Media proof.
 * @see documentation/specifications/media-management.md
 */

import { Pool, type PoolClient, type PoolConfig } from "pg";

const leasesByPool = new WeakMap<Pool, Set<PoolClient>>();
const closingByPool = new WeakMap<Pool, Promise<void>>();

/** Подставляется только в test postgresAdapter args.pg; внутренние поля pg не используются. */
export const createMediaArchitecturePool = (): typeof Pool => {
  return class MediaArchitecturePool extends Pool {
    constructor(options?: PoolConfig) {
      super(options);
      const leases = new Set<PoolClient>();
      leasesByPool.set(this, leases);
      this.on("acquire", (client) => leases.add(client));
      this.on("release", (_error, client) => leases.delete(client));
      this.on("remove", (client) => leases.delete(client));
    }
  };
};

/**
 * Вызывается после завершения proof и остановки cron. Payload 3.88 сохраняет
 * стартовую аренду подключения; освобождаем только свои зарегистрированные аренды.
 */
export const closeMediaArchitecturePool = async (pool: Pool): Promise<void> => {
  const existing = closingByPool.get(pool);
  if (existing) return existing;
  const leases = leasesByPool.get(pool);
  if (!leases) throw new Error("MEDIA_PROTOTYPE_UNOWNED_POOL_REFUSED");
  const closing = (async () => {
    for (const client of [...leases]) client.release(true);
    await pool.end();
    leasesByPool.delete(pool);
  })();
  closingByPool.set(pool, closing);
  await closing;
};
