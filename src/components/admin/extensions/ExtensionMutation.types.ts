/**
 * @file src/components/admin/extensions/ExtensionMutation.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Описывает общую frozen mutation и взаимное исключение операций оболочки и оформления.
 */
export type ExtensionMutationInput = { kind: string; input: unknown };
/** Один serialized payload принадлежит операции до подтверждённого исхода. */
export type ExtensionPendingMutation<Kind extends string> = {
  kind: Kind;
  requestId: string;
  payload: string;
  state: "sending" | "uncertain";
};
/** Imperative acquire блокирует соседнюю операцию ещё до React rerender. */
export type ExtensionMutationLock = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => boolean;
  acquire: (owner: symbol) => boolean;
  release: (owner: symbol) => void;
};
