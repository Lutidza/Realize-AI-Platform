/**
 * @file src/components/admin/task-manager/reference/taskManager.store.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Хранит единый снимок демонстрации и синхронно возвращает результат команды.
 * @see documentation/specifications/task-management-execution.md
 */
import { initialPrototypeState } from "./taskManager.fixtures";
import { prototypeReducer } from "./taskManager.reducer";
import type { PrototypeState, PrototypeStore } from "./taskManager.types";

/** Store принадлежит одному workbench: серверные запросы и отдельные вкладки не делят изменяемые данные. */
export function createPrototypeStore(
  initial: PrototypeState = initialPrototypeState,
): PrototypeStore {
  let snapshot = structuredClone(initial);
  const serverSnapshot = snapshot;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(action) {
      snapshot = prototypeReducer(snapshot, action);
      const result = snapshot.lastResult;
      for (const listener of listeners) listener();
      return result;
    },
  };
}
