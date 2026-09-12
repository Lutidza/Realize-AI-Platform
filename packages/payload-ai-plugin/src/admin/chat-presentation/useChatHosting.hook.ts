/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/useChatHosting.hook.ts
 * @version 1.4.1
 * @date 2026-09-11
 * @description Связывает единый controller с панелью, страницей и отдельным окном чата.
 */

"use client";

import { useConfig } from "@payloadcms/ui";
import { usePathname, useRouter } from "next/navigation.js";
import { formatAdminURL } from "payload/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealizeAIChat } from "../useRealizeAIChat";
import type {
  ChatDisplayMode,
  ChatHandoffState,
  ChatPresentationController,
  RealizeAIProviderProps,
} from "./ChatPresentation.types";
import { CHAT_OPEN_EVENT } from "./chatPresentation.constants";
import { useChatWindow } from "./useChatWindow.hook";
import { useCodexChatSettings } from "./useCodexChatSettings.hook";
import { useChatDeepLink } from "./useChatDeepLink.hook";

/** Скрытый host сохраняет draft и выбранный диалог, но не запускает stream/polling. */
export const useChatHosting = ({
  route,
  integrationsRoute = "/integrations",
}: RealizeAIProviderProps) => {
  const { config } = useConfig();
  const pathname = usePathname();
  const router = useRouter();
  const { settings, isLoading, error, refreshSettings } =
    useCodexChatSettings();
  const pageURL = formatAdminURL({
    adminRoute: config.routes.admin,
    path: route,
  }).replace(/\/$/, "");
  const windowURL = `${pageURL}/window`;
  const settingsURL = formatAdminURL({
    adminRoute: config.routes.admin,
    path: `${integrationsRoute.replace(/\/$/, "")}/codex` as `/${string}`,
  });
  const isPage = pathname === pageURL;
  const isWindow = pathname === windowURL;
  const isSettings =
    pathname.replace(/\/$/, "") === settingsURL.replace(/\/$/, "");
  const [panelOpen, setPanelOpen] = useState(false);
  const [notice, setNotice] = useState<string>();
  const returnURL = useRef(config.routes.admin);
  const focusOrigin = useRef<HTMLElement | null>(null);
  const controller = useRealizeAIChat(
    Boolean(settings) && (panelOpen || isPage || isWindow),
  );
  useChatDeepLink({
    controller,
    enabled: Boolean(settings) && isPage,
    onNotice: setNotice,
  });

  useEffect(() => {
    if (!isPage && !isWindow) returnURL.current = pathname;
  }, [isPage, isWindow, pathname]);

  const openHere = useCallback(
    (mode: "panel" | "page") => {
      setNotice(undefined);
      if (mode === "page") {
        setPanelOpen(false);
        router.push(pageURL);
      } else {
        setPanelOpen(true);
        if (isPage || isWindow) router.push(returnURL.current);
      }
    },
    [isPage, isWindow, pageURL, router],
  );
  const readState = useCallback(
    (): ChatHandoffState => ({
      ...(controller.selectedConversationID
        ? { conversationID: controller.selectedConversationID }
        : {}),
      draft: controller.draft,
      agentConfigurationSelection: controller.agentConfiguration.selection,
      context: controller.context.readReadyContext(),
      workflowDraft: controller.workflow.readDraft(),
    }),
    [
      controller.selectedConversationID,
      controller.draft,
      controller.context,
      controller.agentConfiguration.selection,
      controller.workflow,
    ],
  );
  const {
    setDraft,
    openConversation,
    clearConversationSelection,
    context: { restoreContext },
    agentConfiguration: { restoreSelection },
    workflow: { restoreDraft },
  } = controller;
  const receiveState = useCallback(
    async (state: ChatHandoffState) => {
      try {
        if (state.conversationID) await openConversation(state.conversationID);
        else clearConversationSelection();
      } finally {
        setDraft(state.draft);
        restoreSelection(state.agentConfigurationSelection);
        restoreDraft(state.workflowDraft);
        restoreContext(
          state.context ?? {
            attachments: [],
            projectFiles: [],
            webSearch: false,
          },
        );
      }
    },
    [
      setDraft,
      openConversation,
      clearConversationSelection,
      restoreContext,
      restoreSelection,
      restoreDraft,
    ],
  );
  const { openWindow, returnToParent, focusExistingWindow } = useChatWindow({
    isWindow,
    windowURL,
    readState,
    receiveState,
    openHere,
    onError: setNotice,
  });

  const openChat = useCallback(
    (requestedMode?: ChatDisplayMode) => {
      // Пока popup владеет черновиком, launcher возвращает к его актуальному состоянию.
      if (!isWindow && focusExistingWindow()) return;
      const mode = requestedMode ?? settings?.displayMode ?? "panel";
      const transfersWindow = isWindow ? mode !== "window" : mode === "window";
      if (
        transfersWindow &&
        (controller.pendingWorkflowConversationID ||
          controller.workflow.pendingConversationID)
      ) {
        setNotice(
          "Повторите неподтверждённый запрос процесса или обновите его состояние перед переносом в другое окно.",
        );
        return;
      }
      if (
        controller.isSubmitting ||
        controller.workflow.isPending ||
        controller.isCreatingConversation ||
        (transfersWindow &&
          (controller.context.hasPendingAttachments ||
            controller.context.hasFailedAttachments))
      ) {
        setNotice(
          "Дождитесь сохранения сообщения и загрузок; удалите или повторите неудачные вложения, затем смените расположение чата.",
        );
        return;
      }
      if (!settings) {
        setNotice(error || "Настройки чата ещё загружаются.");
        return;
      }
      if (document.activeElement instanceof HTMLElement)
        focusOrigin.current = document.activeElement;
      if (isWindow) {
        if (mode !== "window") returnToParent(mode);
        else window.focus();
        return;
      }
      if (mode === "window") {
        if (!openWindow()) {
          setNotice(
            "Браузер не открыл окно чата. Разрешите всплывающие окна для этого сайта и повторите действие.",
          );
          return;
        }
        setNotice(undefined);
        setPanelOpen(false);
        if (isPage) router.push(returnURL.current);
      } else openHere(mode);
    },
    [
      settings,
      error,
      isWindow,
      isPage,
      openHere,
      openWindow,
      focusExistingWindow,
      returnToParent,
      router,
      controller.isSubmitting,
      controller.pendingWorkflowConversationID,
      controller.workflow.pendingConversationID,
      controller.workflow.isPending,
      controller.isCreatingConversation,
      controller.context.hasPendingAttachments,
      controller.context.hasFailedAttachments,
    ],
  );

  const closeChat = useCallback(() => {
    if (isWindow) {
      if (
        controller.pendingWorkflowConversationID ||
        controller.workflow.pendingConversationID
      ) {
        setNotice(
          "Повторите неподтверждённый запрос процесса или обновите его состояние перед возвратом чата.",
        );
        return;
      }
      if (
        controller.workflow.isPending ||
        controller.isSubmitting ||
        controller.isCreatingConversation ||
        controller.context.hasPendingAttachments ||
        controller.context.hasFailedAttachments
      ) {
        setNotice(
          "Дождитесь сохранения сообщения и загрузок; удалите или повторите неудачные вложения, затем верните чат в основную вкладку.",
        );
        return;
      }
      returnToParent("panel");
      return;
    }
    setPanelOpen(false);
    if (isPage) router.push(returnURL.current);
    queueMicrotask(() => {
      if (focusOrigin.current?.isConnected) focusOrigin.current.focus();
    });
  }, [
    isWindow,
    isPage,
    returnToParent,
    router,
    controller.isSubmitting,
    controller.pendingWorkflowConversationID,
    controller.workflow.pendingConversationID,
    controller.workflow.isPending,
    controller.isCreatingConversation,
    controller.context.hasPendingAttachments,
    controller.context.hasFailedAttachments,
  ]);
  const openSettings = useCallback(() => {
    setPanelOpen(false);
    router.push(`${settingsURL}#agent`);
  }, [router, settingsURL]);

  useEffect(() => {
    const open = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: unknown }>).detail?.mode;
      if (
        mode === undefined ||
        mode === "panel" ||
        mode === "page" ||
        mode === "window"
      )
        openChat(mode);
    };
    window.addEventListener(CHAT_OPEN_EVENT, open);
    return () => window.removeEventListener(CHAT_OPEN_EVENT, open);
  }, [openChat]);

  const presentation: ChatPresentationController = {
    settings,
    isLoading,
    error,
    notice,
    panelOpen: panelOpen && !isPage && !isWindow,
    isPage,
    isWindow,
    isSettings,
    openChat,
    closeChat,
    openSettings,
    refreshSettings,
    clearNotice: () => setNotice(undefined),
  };
  return { controller, presentation };
};
