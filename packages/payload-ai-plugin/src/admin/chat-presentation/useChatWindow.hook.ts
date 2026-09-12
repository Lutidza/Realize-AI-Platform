/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/useChatWindow.hook.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Управляет отдельным окном чата и проверенным обменом выбранным диалогом и черновиком.
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import type {
  ChatWindowMessage,
  ChatWindowOptions,
} from "./ChatPresentation.types";
import { parseChatWindowMessage } from "./parseChatWindowMessage.validator";

/** Popup создаётся из пользовательского click; сообщения принимаются только от своего окна. */
export const useChatWindow = (options: ChatWindowOptions) => {
  const optionsRef = useRef(options);
  const popupRef = useRef<Window | null>(null);
  const returnRef = useRef<{
    requestID: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const origin = window.location.origin;
    let receivedInitialState = false;
    let active = true;
    const receive = (event: MessageEvent<unknown>) => {
      if (event.origin !== origin) return;
      const message = parseChatWindowMessage(event.data);
      if (!message) return;
      if (optionsRef.current.isWindow) {
        if (!window.opener || event.source !== window.opener) return;
        if (message.type === "realize-chat-state" && !receivedInitialState) {
          receivedInitialState = true;
          void optionsRef.current.receiveState(message.state).catch(() => {
            if (!active) return;
            receivedInitialState = false;
            optionsRef.current.onError(
              "Не удалось загрузить переданный диалог. Черновик сохранён.",
            );
          });
        }
        if (
          message.type === "realize-chat-returned" &&
          returnRef.current?.requestID === message.requestID
        ) {
          clearTimeout(returnRef.current.timer);
          returnRef.current = null;
          window.close();
        }
        return;
      }
      const popup = popupRef.current;
      if (!popup || event.source !== popup) return;
      if (message.type === "realize-chat-ready") {
        popup.postMessage(
          {
            type: "realize-chat-state",
            state: optionsRef.current.readState(),
          } satisfies ChatWindowMessage,
          origin,
        );
      } else if (message.type === "realize-chat-return") {
        void optionsRef.current
          .receiveState(message.state)
          .then(() => {
            if (!active) return;
            optionsRef.current.openHere(message.mode);
            window.focus();
            popup.postMessage(
              {
                type: "realize-chat-returned",
                requestID: message.requestID,
              } satisfies ChatWindowMessage,
              origin,
            );
          })
          .catch(() => {
            if (active)
              optionsRef.current.onError(
                "Не удалось вернуть диалог из отдельного окна. Повторите перенос после загрузки.",
              );
          });
      }
    };
    window.addEventListener("message", receive);
    if (options.isWindow && window.opener)
      window.opener.postMessage(
        { type: "realize-chat-ready" } satisfies ChatWindowMessage,
        origin,
      );
    return () => {
      active = false;
      window.removeEventListener("message", receive);
      if (returnRef.current) clearTimeout(returnRef.current.timer);
    };
  }, [options.isWindow]);

  const focusExistingWindow = useCallback((): boolean => {
    const popup = popupRef.current;
    if (!popup || popup.closed) return false;
    popup.focus();
    return true;
  }, []);

  const openWindow = useCallback((): boolean => {
    const current = optionsRef.current;
    if (focusExistingWindow()) return true;
    const state = current.readState();
    if (!parseChatWindowMessage({ type: "realize-chat-state", state }))
      return false;
    const url = new URL(current.windowURL, window.location.origin);
    if (url.origin !== window.location.origin) return false;
    const popup = window.open(
      url.href,
      "realize-ai-chat",
      "popup=yes,width=1040,height=780,resizable=yes,scrollbars=yes",
    );
    if (!popup) return false;
    popupRef.current = popup;
    popup.postMessage(
      { type: "realize-chat-state", state } satisfies ChatWindowMessage,
      window.location.origin,
    );
    popup.focus();
    return true;
  }, [focusExistingWindow]);

  const returnToParent = useCallback((mode: "panel" | "page") => {
    const opener = window.opener as Window | null;
    if (!opener || opener.closed) {
      optionsRef.current.openHere(mode);
      return;
    }
    if (returnRef.current) clearTimeout(returnRef.current.timer);
    const requestID = crypto.randomUUID();
    returnRef.current = {
      requestID,
      timer: setTimeout(() => {
        returnRef.current = null;
        optionsRef.current.openHere(mode);
      }, 10_000),
    };
    opener.postMessage(
      {
        type: "realize-chat-return",
        requestID,
        mode,
        state: optionsRef.current.readState(),
      } satisfies ChatWindowMessage,
      window.location.origin,
    );
  }, []);

  return { openWindow, returnToParent, focusExistingWindow };
};
