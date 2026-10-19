/**
 * @file src/components/admin/access-tokens/useDeviceAccess.hook.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Загружает device запрос по ручному коду и отправляет только явное решение пользователя.
 * @see documentation/architecture/platform-access.md
 */
"use client";
import { useEffect, useRef, useState } from "react";
import type {
  AccessContextDto,
  DeviceRequestDto,
} from "@realize/payload-access-management/contracts";
import { accessApi } from "./AccessApi.adapter";
import { AccessClientError } from "./AccessClient.error";

/** GET не имеет побочных эффектов авторизации; код из URL никогда не подтверждается автоматически. */
export function useDeviceAccess() {
  const [context, setContext] = useState<AccessContextDto | null>(null);
  const [code, setCode] = useState("");
  const [request, setRequest] = useState<DeviceRequestDto | null>(null);
  const [matched, setMatched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const locked = useRef(false);
  const mounted = useRef(true);
  const readController = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void accessApi.context(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setContext(value);
      },
      (failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof AccessClientError
              ? failure.message
              : "Не удалось проверить пользователя.",
          );
      },
    );
    return () => {
      mounted.current = false;
      controller.abort();
      readController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!request || request.status !== "pending") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [request]);

  const expired = Boolean(request && Date.parse(request.expiresAt) <= now);
  const lookup = async () => {
    if (locked.current || !context) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    setMatched(false);
    const controller = new AbortController();
    readController.current = controller;
    try {
      const result = await accessApi.device(
        code.trim().toUpperCase(),
        controller.signal,
      );
      if (!mounted.current) return;
      setRequest(result);
      setNow(Date.now());
    } catch (failure) {
      if (mounted.current) {
        setRequest(null);
        setError(
          failure instanceof AccessClientError
            ? failure.message
            : "Не удалось проверить код.",
        );
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const decide = async (decision: "approve" | "deny") => {
    if (
      locked.current ||
      !request ||
      request.status !== "pending" ||
      expired ||
      (decision === "approve" && !matched)
    )
      return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await accessApi.decide({
        userCode: request.userCode,
        decision,
      });
      if (mounted.current) {
        setRequest(result);
        setMatched(false);
      }
    } catch (failure) {
      if (mounted.current) {
        setMatched(false);
        setError(
          failure instanceof AccessClientError && !failure.uncertain
            ? failure.message
            : "Ответ на решение не подтверждён. Нажмите «Проверить код», чтобы узнать его состояние.",
        );
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return {
    context,
    code,
    request,
    matched,
    setMatched,
    busy,
    error,
    expired,
    lookup,
    decide,
    changeCode: (value: string) => {
      if (locked.current) return;
      const compact = value.toUpperCase().replace(/\s/g, "");
      setCode(
        compact.length === 8 && !compact.includes("-")
          ? `${compact.slice(0, 4)}-${compact.slice(4)}`
          : compact,
      );
      setRequest(null);
      setMatched(false);
      setError(null);
    },
  };
}
