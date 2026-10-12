/**
 * @file packages/payload-extension-manager/src/persistence/ExtensionStatePersistence.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Задаёт общий strict-codec storage контракт state и immutable replay scopes.
 * @see documentation/specifications/extension-management.md
 */

/** Identity имеет прежний формат/hash; scope и actor поступают только от server owner. */
export type LedgerIdentity = {
  actorKey: string;
  requestId: string;
  kind: "prepare" | "apply";
};
export type ExtensionLedgerStore = { receipts: LedgerIdentity[] };

/** Domain owner строго проверяет весь сериализуемый store/receipt и immutable plan hashes. */
export type ExtensionStateCodec<
  R extends LedgerIdentity,
  S extends { receipts: R[] },
> = {
  parseStore: (value: unknown) => S;
  parseReceipt: (value: unknown) => R;
};

export type ExtensionStateDependency<
  S extends ExtensionLedgerStore = ExtensionLedgerStore,
> = {
  scopeKey: string;
  bootstrap: S | (() => S | Promise<S>);
  codec: ExtensionStateCodec<S["receipts"][number], S>;
};
export type ExtensionStateDependencies = Record<
  string,
  ExtensionStateDependency
>;
export type ExtensionDependencyStores<D extends ExtensionStateDependencies> = {
  [Name in keyof D]: ReturnType<D[Name]["codec"]["parseStore"]> | null;
};

/** Replay получает null dependencies без reads/bootstrap; новый UUID получает snapshots той же txn. */
export type ExtensionStateMutation<
  Result,
  S extends ExtensionLedgerStore,
  D extends ExtensionStateDependencies = Record<never, never>,
> = (
  store: S,
  dependencies: ExtensionDependencyStores<D>,
) => { store: S; result: Result } | Promise<{ store: S; result: Result }>;
export type ExtensionStateStorageSnapshot<S extends ExtensionLedgerStore> = {
  store: S | null;
  storageReady: boolean;
};

/** Узкий private metadata projection; raw Payload document не становится DTO. */
export type ExtensionStateDocument = {
  id: string | number;
  scopeKey: string;
  state: unknown;
};
export type ExtensionReceiptDocument<R = unknown> = {
  id: string | number;
  replayKey: string;
  scopeKey: string;
  kind: "prepare" | "apply";
  record: R;
};
export type ExtensionPersistenceLocalApi = {
  find: (input: Record<string, unknown>) => Promise<{ docs: unknown[] }>;
  create: (input: Record<string, unknown>) => Promise<unknown>;
  update: (input: Record<string, unknown>) => Promise<unknown>;
};
