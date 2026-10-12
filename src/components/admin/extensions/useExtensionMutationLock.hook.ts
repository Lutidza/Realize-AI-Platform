/**
 * @file src/components/admin/extensions/useExtensionMutationLock.hook.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Создаёт один наблюдаемый lock для независимых команд внутри экрана расширений.
 */
"use client";
import { useState } from "react";
import type { ExtensionMutationLock } from "./ExtensionMutation.types";

export function useExtensionMutationLock(): ExtensionMutationLock {
  const [lock] = useState<ExtensionMutationLock>(() => {
    let owner: symbol | null = null;
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach((listener) => listener());
    return {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot: () => owner !== null,
      acquire: (candidate) => {
        if (owner !== null) return false;
        owner = candidate;
        notify();
        return true;
      },
      release: (candidate) => {
        if (owner !== candidate) return;
        owner = null;
        notify();
      },
    };
  });
  return lock;
}
