/**
 * @file src/components/admin/extensions/useInstalledTemplates.hook.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Обновляет отдельный readonly inventory и игнорирует устаревшие ответы после refresh/unmount.
 */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InstalledTemplatesSnapshotDto } from "@realize/payload-extension-manager/contracts";
import { InstalledTemplatesApi } from "./InstalledTemplatesApi.adapter";
import type { InstalledTemplatesTransport } from "./InstalledTemplates.types";

export function useInstalledTemplates(transport?: InstalledTemplatesTransport) {
  const [api] = useState(() => transport ?? new InstalledTemplatesApi());
  const [snapshot, setSnapshot] =
    useState<InstalledTemplatesSnapshotDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const value = await api.snapshot();
      if (!mounted.current || generation.current !== current) return;
      setSnapshot(value);
      setError(null);
    } catch (cause) {
      if (mounted.current && generation.current === current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось прочитать установленные шаблоны.",
        );
    } finally {
      if (mounted.current && generation.current === current) setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(load);
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [load]);
  const refresh = useCallback(() => {
    setLoading(true);
    return load();
  }, [load]);
  return { snapshot, loading, error, refresh };
}
