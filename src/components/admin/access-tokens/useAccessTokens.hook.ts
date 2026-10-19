/**
 * @file src/components/admin/access-tokens/useAccessTokens.hook.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Управляет загрузкой метаданных, выдачей и отзывом доступов без сохранения секрета.
 * @see documentation/architecture/platform-access.md
 */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AccessContextDto,
  AccessCreateInput,
  AccessCreateResult,
  AccessTokenDto,
} from "@realize/payload-access-management/contracts";
import { accessApi } from "./AccessApi.adapter";
import { AccessClientError } from "./AccessClient.error";

/** Секрет живёт только до закрытия окна; read/refresh получает исключительно metadata DTO. */
export function useAccessTokens(ownerId?: string) {
  const [context, setContext] = useState<AccessContextDto | null>(null);
  const [tokens, setTokens] = useState<AccessTokenDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<AccessCreateResult | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AccessTokenDto | null>(null);
  const mounted = useRef(true);
  const mutationLock = useRef(false);
  const readController = useRef<AbortController | null>(null);

  const load = useCallback(
    async (after?: string | null) => {
      readController.current?.abort();
      const controller = new AbortController();
      readController.current = controller;
      setLoading(true);
      setLoadError(null);
      try {
        const snapshot = await accessApi.context(controller.signal);
        if (controller.signal.aborted) return;
        setContext(snapshot);
        const page = await accessApi.tokens(ownerId, after, controller.signal);
        if (controller.signal.aborted) return;
        setTokens((previous) =>
          after
            ? [
                ...previous,
                ...page.items.filter(
                  (token) => !previous.some((entry) => entry.id === token.id),
                ),
              ]
            : page.items,
        );
        setNextCursor(page.nextCursor);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (!after) setTokens([]);
        setLoadError(
          error instanceof AccessClientError
            ? error.message
            : "Не удалось загрузить доступы.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [ownerId],
  );

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return load();
    });
    const forget = () => setCreated(null);
    window.addEventListener("pagehide", forget);
    return () => {
      cancelled = true;
      mounted.current = false;
      readController.current?.abort();
      window.removeEventListener("pagehide", forget);
    };
  }, [load]);

  const create = async (input: AccessCreateInput) => {
    if (
      mutationLock.current ||
      !context ||
      (ownerId && ownerId !== context.actor.id)
    )
      return false;
    mutationLock.current = true;
    setBusy(true);
    setCommandError(null);
    setNotice(null);
    try {
      const result = await accessApi.create(input);
      if (!mounted.current) return false;
      setCreated(result);
      setTokens((previous) => [result.token, ...previous]);
      setCreateOpen(false);
      return true;
    } catch (error) {
      if (!mounted.current) return false;
      const uncertain =
        !(error instanceof AccessClientError) || error.uncertain;
      setCommandError(
        uncertain
          ? "Сервер мог создать доступ, но ответ не получен. Обновите список и отзовите доступ, секрет которого не удалось сохранить. Повторная выдача создаёт отдельный токен."
          : error.message,
      );
      if (uncertain) setCreateOpen(false);
      return false;
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const revoke = async () => {
    if (mutationLock.current || !revokeTarget) return;
    mutationLock.current = true;
    setBusy(true);
    setCommandError(null);
    setCreated(null);
    try {
      const token = await accessApi.revoke(revokeTarget.id);
      if (!mounted.current) return;
      setTokens((previous) =>
        previous.map((entry) => (entry.id === token.id ? token : entry)),
      );
      setRevokeTarget(null);
      setNotice(`Доступ «${token.name}» отозван.`);
    } catch (error) {
      if (mounted.current)
        setCommandError(
          error instanceof AccessClientError
            ? error.message
            : "Не удалось подтвердить отзыв. Обновите список или повторите отзыв.",
        );
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return {
    ownerId,
    context,
    tokens,
    nextCursor,
    loading,
    busy,
    loadError,
    commandError,
    notice,
    createOpen,
    created,
    revokeTarget,
    isSelf: Boolean(context && (!ownerId || ownerId === context.actor.id)),
    refresh: () => {
      setCreated(null);
      return load();
    },
    loadMore: () => load(nextCursor),
    create,
    revoke,
    openCreate: () => {
      if (!mutationLock.current) {
        setCommandError(null);
        setCreateOpen(true);
      }
    },
    closeCreate: () => {
      if (!mutationLock.current) {
        setCreateOpen(false);
        setCommandError(null);
      }
    },
    forgetSecret: () => {
      setCreated(null);
      setNotice("Секрет скрыт. Повторный просмотр недоступен.");
    },
    chooseRevoke: (token: AccessTokenDto | null) => {
      if (!mutationLock.current) {
        setRevokeTarget(token);
        setCommandError(null);
      }
    },
  };
}
