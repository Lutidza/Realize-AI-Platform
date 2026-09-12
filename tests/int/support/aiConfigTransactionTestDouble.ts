/**
 * @file tests/int/support/aiConfigTransactionTestDouble.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Имитирует transaction-local данные и сериализацию config lock для endpoint regression tests.
 */

type TransactionRequest = {
  transactionID?: number | string | Promise<number | string | null>;
};

/** Проверяет wiring транзакции; реальный PostgreSQL lock дополнительно проверяется database integration. */
export const createAIConfigTransactionTestDouble = <T>() => {
  let committed = new Map<string, T[]>();
  let sequence = 0;
  let lockTail = Promise.resolve();
  const states = new Map<
    string,
    { store?: Map<string, T[]>; release?: () => void }
  >();
  const sessions: Record<
    string,
    { db: { execute: (query: string) => Promise<void> } }
  > = {};
  const lockQueries: string[] = [];
  const finish = async (id: unknown, commit: boolean) => {
    const key = String(await id);
    const state = states.get(key);
    if (commit && state?.store) committed = state.store;
    states.delete(key);
    delete sessions[key];
    state?.release?.();
  };
  return {
    committed: () => committed,
    lockQueries,
    db: {
      name: "postgres",
      defaultIDType: "number" as const,
      sessions,
      beginTransaction: async () => {
        const id = `config-tx-${++sequence}`;
        const state: { store?: Map<string, T[]>; release?: () => void } = {};
        states.set(id, state);
        sessions[id] = {
          db: {
            execute: async (query) => {
              if (
                query !==
                "SELECT pg_advisory_xact_lock(hashtext('realize:ai-config:installation'))"
              )
                throw new Error("Unexpected configuration lock query");
              lockQueries.push(query);
              if (state.store) return;
              const previous = lockTail;
              lockTail = new Promise<void>((resolve) => {
                state.release = resolve;
              });
              await previous;
              state.store = structuredClone(committed);
            },
          },
        };
        return id;
      },
      commitTransaction: async (id: unknown) => finish(id, true),
      rollbackTransaction: async (id: unknown) => finish(id, false),
    },
    storeFor: async (req: TransactionRequest | undefined) => {
      const id = await req?.transactionID;
      return (id ? states.get(String(id))?.store : undefined) ?? committed;
    },
  };
};
