/**
 * @file tests/int/useChatConversation.int.spec.ts
 * @version 1.4.0
 * @date 2026-09-12
 * @description Проверяет настройки отправки, безопасный ввод IME и запрет повторной отправки.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type {
  CodexChatSettingsDto,
  ConversationDetailDTO,
  DataOperationDTO,
} from "@realize/ai-contracts";
import { CODEX_CHAT_SETTINGS_DEFAULTS } from "@realize/ai-contracts";
import { ChatConversation } from "../../packages/payload-ai-plugin/src/admin/chat/ChatConversation.component";
import type { RealizeAIController } from "../../packages/payload-ai-plugin/src/admin/RealizeAIContext";

vi.mock("@payloadcms/ui", () => ({
  Popup: () => null,
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("../../packages/payload-ai-plugin/src/admin/DataOperationCard", () => ({
  DataOperationCard: ({
    operation,
    onApply,
  }: {
    operation: DataOperationDTO;
    onApply: () => void;
  }) =>
    createElement("button", { onClick: onApply }, `Операция ${operation.id}`),
}));

const controllerFor = (
  overrides: Partial<RealizeAIController> = {},
): RealizeAIController => ({
  agentConfiguration: {
    catalog: { activePointer: null, release: null, profiles: [] },
    isLoading: false,
    isReady: true,
    refresh: vi.fn(async () => {}),
    selectProfile: vi.fn(),
    restoreSelection: vi.fn(),
  },
  workflow: {
    key: "",
    inputText: "",
    runs: [],
    selectRun: vi.fn(),
    isSelectionReady: true,
    isPending: false,
    hasRetry: false,
    isRefreshing: false,
    isReplying: false,
    canContinue: false,
    select: vi.fn(),
    setInputText: vi.fn(),
    setReplying: vi.fn(),
    readStart: vi.fn(),
    readDraft: vi.fn(() => ({ key: "", inputText: "" })),
    restoreDraft: vi.fn(),
    clearSentSelection: vi.fn(),
    continue: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  },
  context: {
    attachments: [],
    projectFiles: [],
    webSearch: false,
    isSelectingPageDraft: false,
    selectPageDraft: vi.fn(async () => {}),
    removePageDraft: vi.fn(),
    hasPendingAttachments: false,
    hasFailedAttachments: false,
    addAttachments: vi.fn(),
    retryAttachment: vi.fn(),
    removeAttachment: vi.fn(async () => {}),
    setProjectFiles: vi.fn(),
    setWebSearch: vi.fn(),
    clearError: vi.fn(),
    readReadyContext: vi.fn(() => ({
      attachments: [],
      projectFiles: [],
      webSearch: false,
    })),
    restoreContext: vi.fn(),
    clearSentContext: vi.fn(),
  },
  archiveConversation: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  clearError: vi.fn(),
  clearConversationSelection: vi.fn(),
  conversations: [],
  applyDataOperation: vi.fn(async () => {}),
  approveDataRollback: vi.fn(async () => {}),
  createChangeRequest: vi.fn(async () => {}),
  createDataOperation: vi.fn(async () => {}),
  decideChangeRequest: vi.fn(async () => {}),
  decideImplementation: vi.fn(async () => {}),
  decideDataOperation: vi.fn(async () => {}),
  decidePreview: vi.fn(async () => {}),
  decideRelease: vi.fn(async () => {}),
  draft: "Проверь каталог",
  isCreatingConversation: false,
  isSubmitting: false,
  executeChangeRequest: vi.fn(async () => {}),
  deployPreview: vi.fn(async () => {}),
  prepareRelease: vi.fn(async () => {}),
  publishPullRequest: vi.fn(async () => {}),
  rollbackDataOperation: vi.fn(async () => {}),
  openConversation: vi.fn(async () => {}),
  ready: true,
  search: "",
  send: vi.fn(async () => {}),
  setDraft: vi.fn(),
  setSearch: vi.fn(),
  startConversation: vi.fn(async () => {}),
  stream: {
    elapsedSeconds: 0,
    phase: "idle",
    retry: vi.fn(),
    streamingMessage: "",
  },
  ...overrides,
});

const renderConversation = (
  controller = controllerFor(),
  settings: CodexChatSettingsDto = CODEX_CHAT_SETTINGS_DEFAULTS,
) => {
  render(createElement(ChatConversation, { controller, settings }));
  return screen.getByRole("textbox", { name: "Сообщение ассистенту" });
};

afterEach(cleanup);

describe("Отправка сообщения в ChatConversation", () => {
  it.each(["loading", "workflow", "unavailable"])(
    "сохраняет выбранную страницу и блокирует отправку при %s",
    (reason) => {
      const controller = controllerFor();
      controller.context.pageDraft = {
        id: "42",
        title: "О компании",
        fingerprint: "a".repeat(64),
      };
      controller.context.isSelectingPageDraft = reason === "loading";
      if (reason === "workflow") controller.workflow.key = "flow";
      if (reason !== "unavailable")
        controller.context.capabilities = {
          attachments: {
            available: false,
            maxFiles: 0,
            maxImageBytes: 0,
            maxTextBytes: 0,
            maxTotalBytes: 0,
            extensions: [],
            mimeTypes: [],
          },
          projectFiles: { available: false, maxFiles: 0 },
          webSearch: { available: false },
          pageDrafts: { available: true },
        };
      renderConversation(controller);
      expect(screen.getByText("Страница: О компании")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
      expect(controller.send).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole("button", { name: "Убрать страницу О компании" }),
      );
      expect(controller.context.removePageDraft).toHaveBeenCalledOnce();
    },
  );
  it("блокирует отправку устаревшего профиля, сохраняя текст и доступ к его исправлению", () => {
    const controller = controllerFor();
    controller.agentConfiguration = {
      ...controller.agentConfiguration,
      isReady: false,
      selection: {
        releaseID: "old",
        manifestHash: "a".repeat(64),
        profileKey: "editor",
      },
      catalog: {
        activePointer: {
          releaseID: "new",
          manifestHash: "b".repeat(64),
          version: 2,
          activatedAt: "2026-09-10T12:00:00.000Z",
          activatedBy: "fixture",
        },
        release: { id: "new", manifestHash: "b".repeat(64), version: 2 },
        profiles: [
          {
            key: "editor",
            title: "Редактор",
            description: "Каталог",
            locale: "ru",
          },
        ],
      },
    };
    const input = renderConversation(controller);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    fireEvent.submit(input.closest("form")!);
    expect(controller.send).not.toHaveBeenCalled();
    expect((input as HTMLTextAreaElement).value).toBe("Проверь каталог");
    expect((input as HTMLTextAreaElement).disabled).toBe(false);
    fireEvent.click(screen.getByText("editor").closest("summary")!);
    fireEvent.click(
      screen.getByRole("button", { name: "Выбрать профиль «Редактор»" }),
    );
    expect(controller.agentConfiguration.selectProfile).toHaveBeenCalledWith(
      "editor",
    );
    expect(controller.setDraft).not.toHaveBeenCalled();
  });
  it("сохраняет остановку активного ответа при заблокированном вводе", () => {
    const controller = controllerFor({
      currentRun: {
        conversationID: "conversation",
        createdAt: "2026-09-09T12:00:00.000Z",
        id: "run",
        provider: "openai-codex",
        sandboxProfile: "analysis-readonly",
        status: "running",
        updatedAt: "2026-09-09T12:00:00.000Z",
      },
    });
    const input = renderConversation(controller);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(controller.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Остановить ответ" }));
    expect(controller.cancel).toHaveBeenCalledTimes(1);
  });
  it("отправляет по Enter при включённой настройке", () => {
    const controller = controllerFor();
    const input = renderConversation(controller);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(controller.send).toHaveBeenCalledTimes(1);
  });

  it("сохраняет перенос строки по Enter при отключённой настройке и отправку кнопкой", () => {
    const controller = controllerFor();
    const input = renderConversation(controller, {
      ...CODEX_CHAT_SETTINGS_DEFAULTS,
      sendOnEnter: false,
    });
    expect(fireEvent.keyDown(input, { key: "Enter", code: "Enter" })).toBe(
      true,
    );
    expect(controller.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Отправить$/ }));
    expect(controller.send).toHaveBeenCalledTimes(1);
  });

  it("не отправляет Shift+Enter, IME composition и подтверждение IME с keyCode 229", () => {
    const controller = controllerFor();
    const input = renderConversation(controller);
    for (const modifiers of [
      { shiftKey: true },
      { isComposing: true },
      { keyCode: 229 },
    ]) {
      expect(
        fireEvent.keyDown(input, { key: "Enter", code: "Enter", ...modifiers }),
      ).toBe(true);
    }
    expect(controller.send).not.toHaveBeenCalled();
  });

  it.each([
    { isSubmitting: true },
    { isCreatingConversation: true },
    { ready: false },
    { draft: "   " },
  ])("не отправляет при недоступном вводе: %o", (overrides) => {
    const controller = controllerFor(overrides);
    const input = renderConversation(controller);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    fireEvent.submit(input.closest("form")!);
    expect(controller.send).not.toHaveBeenCalled();
  });
});

describe("Настройки новых операций", () => {
  const createdAt = "2026-09-09T12:00:00.000Z";
  const detail: ConversationDetailDTO = {
    changeRequests: [],
    dataOperations: [],
    runs: [],
    conversation: {
      id: "conversation",
      title: "Проверка операций",
      status: "active",
      createdAt,
      updatedAt: createdAt,
      lastMessageAt: createdAt,
    },
    messages: [
      {
        id: "code-message",
        content: "План изменения кода",
        conversationID: "conversation",
        createdAt,
        dataOperationIntentAvailable: false,
        changePlan: { status: "ready" },
        kind: "assistant_message",
        role: "assistant",
        sequence: 1,
      },
      {
        id: "data-message",
        content: "План изменения данных",
        conversationID: "conversation",
        createdAt,
        dataOperationIntentAvailable: true,
        changePlan: { status: "unavailable", reason: "data_operation" },
        kind: "assistant_message",
        role: "assistant",
        sequence: 2,
      },
    ],
  };

  it("показывает разрешённые действия и передаёт точный source message", () => {
    const controller = controllerFor({ detail });
    renderConversation(controller);
    fireEvent.click(
      screen.getByRole("button", { name: "Оформить план изменения" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Подготовить изменение данных" }),
    );
    expect(controller.createChangeRequest).toHaveBeenCalledWith("code-message");
    expect(controller.createDataOperation).toHaveBeenCalledWith("data-message");
  });

  it("скрывает новые операции при выключенных tools и сохраняет сообщения", () => {
    renderConversation(controllerFor({ detail }), {
      ...CODEX_CHAT_SETTINGS_DEFAULTS,
      tools: { codeChanges: false, dataOperations: false },
    });
    expect(
      screen.queryByRole("button", { name: "Оформить план изменения" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Подготовить изменение данных" }),
    ).toBeNull();
    expect(screen.getByText("План изменения кода")).toBeTruthy();
    expect(screen.getByText("План изменения данных")).toBeTruthy();
  });

  it.each(["missing_paths", "too_short"] as const)(
    "предлагает уточнить ответ с причиной %s, сохраняет ввод и не запускает запрос",
    (reason) => {
      const controller = controllerFor({
        detail: {
          ...detail,
          messages: [
            {
              ...detail.messages[0]!,
              content: "Новая редакция текста страницы",
              changePlan: { status: "needs_clarification", reason },
            },
          ],
        },
        draft: "Сохрани мои дополнительные пожелания",
      });
      const input = renderConversation(controller);
      expect(
        screen.queryByRole("button", { name: "Оформить план изменения" }),
      ).toBeNull();
      expect(
        screen.getByText("Этот ответ ещё не содержит плана изменения."),
      ).toBeTruthy();
      fireEvent.click(
        screen.getByRole("button", { name: "Уточнить изменение" }),
      );
      const nextDraft = vi.mocked(controller.setDraft).mock.calls[0]![0];
      expect(nextDraft).toMatch(/^Сохрани мои дополнительные пожелания\n\n/);
      expect(nextDraft).toContain("Новая редакция текста страницы");
      expect(nextDraft).toContain("данные CMS или код проекта");
      expect(nextDraft).toContain("поддерживаемую операцию данных");
      expect(nextDraft).toContain("Не придумывай пути файлов");
      expect(document.activeElement).toBe(input);
      expect(controller.send).not.toHaveBeenCalled();
      expect(controller.createChangeRequest).not.toHaveBeenCalled();
      expect(controller.createDataOperation).not.toHaveBeenCalled();
    },
  );

  it("при старом DTO скрывает оформление и не переносит длинный текст и protocol block в уточнение", () => {
    const legacy = { ...detail.messages[0]! };
    delete (legacy as Partial<typeof legacy>).changePlan;
    legacy.content = `${"Описание страницы ".repeat(100)}\n\n\`\`\`realize-data-operation\nprivate-protocol-payload\n\`\`\``;
    const controller = controllerFor({
      detail: { ...detail, messages: [legacy] },
      draft: "",
    });
    renderConversation(controller);
    expect(
      screen.queryByRole("button", { name: "Оформить план изменения" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Уточнить изменение" }));
    const nextDraft = vi.mocked(controller.setDraft).mock.calls[0]![0];
    expect(nextDraft.length).toBeLessThan(1_000);
    expect(nextDraft).not.toContain("realize-data-operation");
    expect(nextDraft).not.toContain("private-protocol-payload");
    expect(controller.send).not.toHaveBeenCalled();
  });

  it("сохраняет полный ввод и объясняет нехватку места для уточнения", () => {
    const draft = "А".repeat(7_900);
    const controller = controllerFor({
      detail: {
        ...detail,
        messages: [
          {
            ...detail.messages[0]!,
            changePlan: {
              status: "needs_clarification",
              reason: "missing_paths",
            },
          },
        ],
      },
      draft,
    });
    const input = renderConversation(controller);
    fireEvent.click(screen.getByRole("button", { name: "Уточнить изменение" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Для уточнения не хватает места в поле сообщения",
    );
    expect((input as HTMLTextAreaElement).value).toBe(draft);
    expect(document.activeElement).toBe(input);
    expect(controller.setDraft).not.toHaveBeenCalled();
    expect(controller.send).not.toHaveBeenCalled();
    expect(controller.createChangeRequest).not.toHaveBeenCalled();
  });

  it.each([
    { isSubmitting: true },
    { isCreatingConversation: true },
    { workflow: { ...controllerFor().workflow, isReplying: true } },
  ])("сохраняет ввод при временно недоступном уточнении: %o", (overrides) => {
    const controller = controllerFor({
      detail: {
        ...detail,
        messages: [
          {
            ...detail.messages[0]!,
            changePlan: {
              status: "needs_clarification",
              reason: "missing_paths",
            },
          },
        ],
      },
      ...overrides,
    });
    renderConversation(controller);
    fireEvent.click(screen.getByRole("button", { name: "Уточнить изменение" }));
    expect(controller.setDraft).not.toHaveBeenCalled();
    expect(controller.send).not.toHaveBeenCalled();
  });

  it("не предлагает уточнять code scope для Data Operation", () => {
    renderConversation(
      controllerFor({ detail: { ...detail, messages: [detail.messages[1]!] } }),
    );
    expect(
      screen.queryByRole("button", { name: "Уточнить изменение" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Подготовить изменение данных" }),
    ).toBeTruthy();
  });

  it.each(["system", "user"] as const)(
    "не предлагает действия над кодом для сообщения роли %s без readiness",
    (role) => {
      const legacy = { ...detail.messages[0]!, role };
      delete (legacy as Partial<typeof legacy>).changePlan;
      renderConversation(
        controllerFor({ detail: { ...detail, messages: [legacy] } }),
      );
      expect(
        screen.queryByRole("button", { name: "Уточнить изменение" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Оформить план изменения" }),
      ).toBeNull();
    },
  );

  it("показывает профиль сохранённого запуска независимо от текущего выбора", () => {
    const controller = controllerFor({
      detail: {
        ...detail,
        messages: [{ ...detail.messages[0]!, runID: "historic" }],
        runs: [
          {
            id: "historic",
            conversationID: "conversation",
            createdAt,
            updatedAt: createdAt,
            provider: "openai-codex",
            sandboxProfile: "analysis-readonly",
            status: "completed",
            agentConfiguration: {
              releaseID: "release-old",
              releaseVersion: 3,
              manifestHash: "a".repeat(64),
              profileKey: "old.editor",
              profileTitle: "Прежний редактор",
              profileRevision: 1,
              compiledContextHash: "b".repeat(64),
              systemManifestHash: "c".repeat(64),
              systemReleaseID: "system-1",
              pointerVersion: 7,
            },
          },
        ],
      },
    });
    renderConversation(controller);
    expect(screen.getByText("Прежний редактор · выпуск 3")).toBeTruthy();
    expect(screen.getByText("Системная конфигурация")).toBeTruthy();
  });
});

describe("Рабочие процессы в composer", () => {
  const createdAt = "2026-09-11T10:00:00.000Z";
  it("показывает ожидающий шаг, отправляет текст и позволяет явно вернуться в обычный чат", () => {
    const controller = controllerFor();
    controller.agentConfiguration.isReady = false;
    controller.workflow = {
      ...controller.workflow,
      isReplying: true,
      canContinue: true,
      run: {
        id: "parent",
        conversationID: "chat",
        createdAt,
        updatedAt: createdAt,
        provider: "openai-codex",
        sandboxProfile: "analysis-readonly",
        status: "completed",
        workflow: {
          key: "flow",
          title: "Проверка каталога",
          revision: 1,
          stepKey: "ask",
          stepType: "request_input",
          version: 2,
          completedSteps: 1,
          phase: "awaiting_input",
        },
      },
    };
    const input = renderConversation(controller);
    expect(screen.getByRole("status").textContent).toContain(
      "Ожидает ваш ответ",
    );
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(controller.send).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Системная конфигурация")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Вернуться к обычному чату" }),
    );
    expect(controller.workflow.setReplying).toHaveBeenCalledWith(false);
  });
  it("запрещает ответ с контекстом и позволяет убрать уже включённый веб-поиск", () => {
    const controller = controllerFor();
    controller.workflow = {
      ...controller.workflow,
      isReplying: true,
      canContinue: true,
    };
    controller.context.webSearch = true;
    controller.context.capabilities = {
      webSearch: { available: true },
      attachments: { available: false },
      projectFiles: { available: false },
    } as NonNullable<typeof controller.context.capabilities>;
    const input = renderConversation(controller);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(controller.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Веб-поиск" }));
    expect(controller.context.setWebSearch).toHaveBeenCalledWith(false);
  });
  it("повтор неизвестного старта явно подписан и не зависит от изменённого каталога или текста", () => {
    const controller = controllerFor({
      draft: "",
      selectedConversationID: "chat",
      pendingWorkflowConversationID: "chat",
    });
    controller.agentConfiguration.isReady = false;
    renderConversation(controller);
    expect(screen.getByText(/Повтор отправит исходное сообщение/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Повторить запуск процесса" }),
    );
    expect(controller.send).toHaveBeenCalledTimes(1);
  });
  it("масштабирует список процессов до 512 записей и сохраняет явный режим обычного чата", () => {
    const controller = controllerFor();
    controller.agentConfiguration.selection = {
      releaseID: "release",
      manifestHash: "a".repeat(64),
      profileKey: "profile",
    };
    controller.agentConfiguration.catalog = {
      activePointer: null,
      release: { id: "release", manifestHash: "a".repeat(64), version: 1 },
      profiles: [
        {
          key: "profile",
          title: "Профиль",
          locale: "ru",
          description: "",
          defaultWorkflowKey: "flow.0",
          workflows: Array.from({ length: 512 }, (_, index) => ({
            key: `flow.${index}`,
            title: `Процесс ${index}`,
            description: "Каталог",
          })),
        },
      ],
    };
    renderConversation(controller);
    fireEvent.click(
      screen.getByLabelText("Рабочий процесс для следующего сообщения"),
    );
    expect(
      screen.getAllByRole("button", { name: /Выбрать процесс/ }),
    ).toHaveLength(25);
    expect(controller.workflow.select).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Следующая страница процессов" }),
    );
    expect(
      screen.getByRole("button", { name: "Выбрать процесс «Процесс 25»" }),
    ).toBeTruthy();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Поиск рабочих процессов" }),
      { target: { value: "Процесс 511" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Выбрать процесс «Процесс 511»" }),
    );
    expect(controller.workflow.select).toHaveBeenCalledWith("flow.511");
  });
  it("не предлагает оформить кодовый план из вопроса процесса, сохраняя карточку его DataOperation", () => {
    const operation = {
      id: "planned",
      sourceMessageID: "question",
    } as DataOperationDTO;
    const controller = controllerFor({
      detail: {
        conversation: {
          id: "chat",
          title: "Каталог",
          status: "active",
          createdAt,
          updatedAt: createdAt,
          lastMessageAt: createdAt,
        },
        runs: [
          {
            id: "parent",
            conversationID: "chat",
            status: "completed",
            createdAt,
            updatedAt: createdAt,
            provider: "openai-codex",
            sandboxProfile: "analysis-readonly",
            workflow: {
              key: "flow",
              title: "Процесс",
              revision: 1,
              stepKey: "ask",
              stepType: "request_input",
              version: 2,
              completedSteps: 1,
              phase: "awaiting_input",
            },
          },
        ],
        changeRequests: [],
        dataOperations: [operation],
        messages: [
          {
            id: "question",
            runID: "parent",
            conversationID: "chat",
            role: "assistant",
            kind: "assistant_message",
            dataOperationIntentAvailable: false,
            changePlan: {
              status: "needs_clarification",
              reason: "missing_paths",
            },
            content: "Укажите товар",
            sequence: 1,
            createdAt,
          },
        ],
      },
    });
    renderConversation(controller);
    expect(
      screen.queryByRole("button", { name: "Оформить план изменения" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Уточнить изменение" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Операция planned" }));
    expect(controller.applyDataOperation).toHaveBeenCalledWith(operation);
  });
  it("показывает все DataOperation исходного сообщения и передаёт отдельный DTO каждой карточке", () => {
    const operations = ["one", "two"].map(
      (id) => ({ id, sourceMessageID: "source" }) as DataOperationDTO,
    );
    const controller = controllerFor({
      detail: {
        conversation: {
          id: "chat",
          title: "Каталог",
          status: "active",
          createdAt,
          updatedAt: createdAt,
          lastMessageAt: createdAt,
        },
        runs: [],
        changeRequests: [],
        dataOperations: operations,
        messages: [
          {
            id: "source",
            conversationID: "chat",
            role: "user",
            kind: "user_message",
            dataOperationIntentAvailable: false,
            changePlan: { status: "unavailable", reason: "not_assistant" },
            content: "Проверь",
            sequence: 1,
            createdAt,
          },
        ],
      },
    });
    renderConversation(controller);
    fireEvent.click(screen.getByRole("button", { name: "Операция one" }));
    fireEvent.click(screen.getByRole("button", { name: "Операция two" }));
    expect(controller.applyDataOperation).toHaveBeenNthCalledWith(
      1,
      operations[0],
    );
    expect(controller.applyDataOperation).toHaveBeenNthCalledWith(
      2,
      operations[1],
    );
  });
});
