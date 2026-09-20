/**
 * @file src/components/admin/task-manager/reference/useTaskManagerStore.hook.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Подписывает интерфейс на локальный store без асинхронной гонки результата формы.
 * @see documentation/specifications/task-management-execution.md
 */
"use client";

import { useState, useSyncExternalStore } from "react";
import { createPrototypeStore } from "./taskManager.store";

export function useTaskManagerStore() {
  const [store] = useState(createPrototypeStore);
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { state, dispatch: store.dispatch, getSnapshot: store.getSnapshot };
}
