/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/useCodexLogin.hook.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Ведёт ограниченную попытку входа ChatGPT с опросом, отменой и очисткой при выходе.
 */

"use client";

import type {
  CodexLoginPendingDTO,
  StartCodexLoginInput,
} from "@realize/ai-contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CodexLoginOptions } from "./CodexLogin.types";
import { codexIntegrationAPI } from "./codexIntegrationAPI.adapter";

/** Код существует только в памяти панели; сервер хранит и завершает саму авторизацию. */
export const useCodexLogin = ({ onCompleted }: CodexLoginOptions) => {
  const [session, setSession] = useState<CodexLoginPendingDTO>();
  const [isStarting, setStarting] = useState(false);
  const [isCancelling, setCancelling] = useState(false);
  const [isCopied, setCopied] = useState(false);
  const [isCompleting, setCompleting] = useState(false);
  const [callbackURL, setCallbackURL] = useState("");
  const [error, setError] = useState<string>();
  const mounted = useRef(true);
  const currentSession = useRef<CodexLoginPendingDTO | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const pending = currentSession.current;
      currentSession.current = undefined;
      if (pending) {
        void codexIntegrationAPI
          .cancelLogin({ sessionID: pending.sessionID })
          .catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!session || isCancelling || isCompleting) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (Date.now() >= Date.parse(session.expiresAt)) {
          await codexIntegrationAPI.cancelLogin({
            sessionID: session.sessionID,
          });
          if (controller.signal.aborted) return;
          currentSession.current = undefined;
          setSession(undefined);
          setCallbackURL("");
          setError("Время входа истекло. Начните вход заново.");
          return;
        }
        const result = await codexIntegrationAPI.loginStatus(
          { sessionID: session.sessionID },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (result.status === "completed") {
          currentSession.current = undefined;
          setSession(undefined);
          setCallbackURL("");
          setError(undefined);
          onCompleted(result.connection);
          return;
        }
        if (result.status === "failed") {
          currentSession.current = undefined;
          setSession(undefined);
          setCallbackURL("");
          setError(result.message);
          return;
        }
        setError(undefined);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось проверить вход. Повторяем попытку.",
        );
      }
      if (!controller.signal.aborted)
        timer = setTimeout(() => void poll(), 4000);
    };
    timer = setTimeout(() => void poll(), 4000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [isCancelling, isCompleting, onCompleted, session]);

  const start = useCallback(async (input: StartCodexLoginInput) => {
    if (currentSession.current) return;
    setStarting(true);
    setError(undefined);
    setCopied(false);
    setCallbackURL("");
    try {
      const pending = await codexIntegrationAPI.startLogin(input);
      if (!mounted.current) {
        await codexIntegrationAPI.cancelLogin({ sessionID: pending.sessionID });
        return;
      }
      currentSession.current = pending;
      setSession(pending);
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "Не удалось начать вход.",
        );
    } finally {
      if (mounted.current) setStarting(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    const pending = currentSession.current;
    if (!pending) return;
    setCancelling(true);
    setError(undefined);
    try {
      await codexIntegrationAPI.cancelLogin({ sessionID: pending.sessionID });
      if (!mounted.current) return;
      currentSession.current = undefined;
      setSession(undefined);
      setCopied(false);
      setCallbackURL("");
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось отменить вход. Повторите попытку.",
        );
    } finally {
      if (mounted.current) setCancelling(false);
    }
  }, []);

  const copy = useCallback(async () => {
    const pending = currentSession.current;
    if (!pending || pending.loginMethod !== "deviceCode") return;
    try {
      await navigator.clipboard.writeText(pending.userCode);
      if (mounted.current) setCopied(true);
    } catch {
      if (mounted.current)
        setError(
          "Не удалось скопировать код. Выделите и скопируйте его вручную.",
        );
    }
  }, []);

  const complete = async () => {
    const pending = currentSession.current;
    if (
      !pending ||
      pending.loginMethod !== "browser" ||
      isCompleting ||
      !callbackURL.trim()
    )
      return;
    setCompleting(true);
    setError(undefined);
    const submittedURL = callbackURL.trim();
    setCallbackURL("");
    try {
      const result = await codexIntegrationAPI.completeLogin({
        sessionID: pending.sessionID,
        callbackURL: submittedURL,
      });
      if (
        !mounted.current ||
        currentSession.current?.sessionID !== pending.sessionID
      )
        return;
      if (result.status === "completed") {
        currentSession.current = undefined;
        setSession(undefined);
        onCompleted(result.connection);
      } else if (result.status === "failed") {
        currentSession.current = undefined;
        setSession(undefined);
        setError(result.message);
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось завершить вход. Проверьте адрес возврата.",
        );
    } finally {
      if (mounted.current) setCompleting(false);
    }
  };

  return {
    cancel,
    callbackURL,
    complete,
    clearError: () => setError(undefined),
    copy,
    error,
    isCancelling,
    isCompleting,
    isCopied,
    isStarting,
    session,
    setCallbackURL,
    start,
  };
};
