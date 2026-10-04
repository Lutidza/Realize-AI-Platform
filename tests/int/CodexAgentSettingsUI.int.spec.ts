/**
 * @file tests/int/CodexAgentSettingsUI.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-30
 * @description Проверяет административный переключатель, сохранение черновика и безопасное повторение запроса.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CODEX_AGENT_SETTINGS_DEFAULTS,
  parseCodexIntegrationConfiguration,
} from "@realize/ai-contracts";
import type { CodexIntegrationConnectionDTO } from "@realize/ai-contracts";
import { RealizeAIRequestError } from "../../packages/payload-ai-plugin/src/admin/RealizeAIRequest.error";
import { useCodexAgentSettings } from "../../packages/payload-ai-plugin/src/admin/integrations/codex/useCodexAgentSettings.hook";
import { CodexAgentSettingsView } from "../../packages/payload-ai-plugin/src/admin/integrations/codex/CodexAgentSettings.view";
import { useCodexIntegrationTab } from "../../packages/payload-ai-plugin/src/admin/integrations/codex/useCodexIntegrationTab.hook";
import { useAdminAgentRuntime } from "../../packages/payload-ai-plugin/src/admin/chat/useAdminAgentRuntime.hook";
import { CHAT_SETTINGS_UPDATED_EVENT } from "../../packages/payload-ai-plugin/src/admin/chat-presentation/chatPresentation.constants";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  catalog: vi.fn(),
  request: vi.fn(),
  models: vi.fn(),
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/admin/integrations/codex/codexIntegrationAPI.adapter",
  () => ({
    codexIntegrationAPI: {
      saveAgentSettings: mocks.save,
      models: mocks.models,
    },
  }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/admin/integrations/integrationAPI",
  () => ({ loadIntegrationCatalog: mocks.catalog }),
);
vi.mock("../../packages/payload-ai-plugin/src/admin/realizeAIAPI", () => ({
  requestRealizeAI: mocks.request,
}));

const connection = (
  values: Partial<CodexIntegrationConnectionDTO> = {},
): CodexIntegrationConnectionDTO => ({
  id: "codex",
  connectionKey: "codex:primary",
  provider: "codex",
  enabled: false,
  displayName: "Тестовая интеграция",
  hasCredential: true,
  lastTestStatus: "never",
  revision: 3,
  updatedAt: "2026-09-11T10:00:00Z",
  configuration: parseCodexIntegrationConfiguration({ authMode: "chatgpt" }),
  ...values,
});
const useForm = (initial = connection()) => {
  const [current, setCurrent] = useState<
    CodexIntegrationConnectionDTO | undefined
  >(initial);
  const form = useCodexAgentSettings({
    connection: current,
    onConnectionChange: setCurrent,
    disabled: false,
  });
  return { form, current, setCurrent };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockReset();
  mocks.request.mockReset();
  mocks.models.mockReset();
  window.history.replaceState(null, "", "/admin/integrations/codex");
});
afterEach(cleanup);

describe("Настройки админского агента", () => {
  it("загружает каталог явно и сохраняет выбранную модель поискового субагента с общей ревизией", async () => {
    const { result } = renderHook(() => useForm());
    expect(mocks.models).not.toHaveBeenCalled();
    mocks.models.mockResolvedValue({
      source: "codex-model-list",
      fetchedAt: "2026-09-30T12:00:00Z",
      revision: 3,
      models: [
        {
          model: "catalog-search",
          displayName: "Catalog search",
          description: "Provider description",
          isDefault: false,
          multiAgentVersion: "v1",
        },
        {
          model: "catalog-disabled",
          displayName: "Disabled",
          description: "",
          isDefault: false,
          multiAgentVersion: "disabled",
        },
      ],
    });
    await act(() => result.current.form.loadModels());
    expect(
      result.current.form.searchModels?.map((model) => model.model),
    ).toEqual(["catalog-search"]);
    act(() =>
      result.current.form.update({
        search: {
          ...result.current.form.settings.search,
          mode: "subagent",
          model: "catalog-search",
        },
      }),
    );
    mocks.save.mockImplementation(async (input) =>
      connection({
        revision: 4,
        configuration: { ...connection().configuration, agent: input.settings },
      }),
    );
    await act(() => result.current.form.save());
    expect(mocks.save.mock.calls[0][0]).toMatchObject({
      expectedRevision: 3,
      settings: {
        search: { enabled: true, mode: "subagent", model: "catalog-search" },
      },
    });
    expect(result.current.form.modelCatalog).toBeUndefined();
    expect(result.current.form.settings.search.model).toBe("catalog-search");
  });
  it("отображает сохранённый switch и не включает новые операции по умолчанию", () => {
    const { result } = renderHook(() => useForm());
    expect(result.current.form.enabled).toBe(false);
    expect(result.current.form.settings).toEqual(CODEX_AGENT_SETTINGS_DEFAULTS);
    expect(result.current.form.settings.execution.enabled).toBe(false);
    expect(result.current.form.isDirty).toBe(false);
  });
  it("сохраняет switch и модель одним запросом текущей ревизии", async () => {
    const { result } = renderHook(() => useForm());
    mocks.save.mockImplementation(async (input) =>
      connection({
        enabled: input.enabled,
        revision: 4,
        configuration: { ...connection().configuration, agent: input.settings },
      }),
    );
    act(() => {
      result.current.form.setEnabled(true);
      result.current.form.update({ model: "custom-model" });
    });
    await act(() => result.current.form.save());
    expect(mocks.save).toHaveBeenCalledWith(
      {
        expectedRevision: 3,
        enabled: true,
        settings: { ...CODEX_AGENT_SETTINGS_DEFAULTS, model: "custom-model" },
      },
      expect.stringMatching(/^integration:/),
    );
    expect(result.current.form.enabled).toBe(true);
    expect(result.current.form.isDirty).toBe(false);
    expect(result.current.current?.revision).toBe(4);
  });
  it("не отправляет неверный model/TTL на сервер и сохраняет введённые значения", async () => {
    const { result } = renderHook(() => useForm());
    act(() => result.current.form.update({ model: "model with spaces" }));
    await act(() => result.current.form.save());
    expect(mocks.save).not.toHaveBeenCalled();
    expect(result.current.form.error).toBeTruthy();
    act(() =>
      result.current.form.update({
        model: "",
        preview: { enabled: true, ttlSeconds: 0 },
      }),
    );
    await act(() => result.current.form.save());
    expect(mocks.save).not.toHaveBeenCalled();
    expect(result.current.form.settings.preview.ttlSeconds).toBe(0);
  });
  it("повторяет неизвестный результат с неизменным ключом и телом и блокирует редактирование", async () => {
    const { result } = renderHook(() => useForm());
    mocks.save.mockRejectedValueOnce(new Error("Потеря соединения"));
    act(() => result.current.form.setEnabled(true));
    await act(() => result.current.form.save());
    expect(result.current.form.hasRetry).toBe(true);
    const first = mocks.save.mock.calls[0];
    act(() => {
      result.current.form.update({ model: "another" });
      result.current.form.setEnabled(false);
      result.current.form.reset();
    });
    expect(result.current.form.enabled).toBe(true);
    expect(result.current.form.settings.model).toBe("");
    mocks.save.mockResolvedValueOnce(
      connection({ enabled: true, revision: 4 }),
    );
    await act(() => result.current.form.save());
    expect(mocks.save.mock.calls[1]).toEqual(first);
    expect(result.current.form.hasRetry).toBe(false);
  });
  it("не допускает два запроса сохранения из одного события", async () => {
    const { result } = renderHook(() => useForm());
    let complete!: (value: CodexIntegrationConnectionDTO) => void;
    mocks.save.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    act(() => result.current.form.setEnabled(true));
    let first!: Promise<void>;
    act(() => {
      first = result.current.form.save();
      void result.current.form.save();
    });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    await act(async () => {
      complete(connection({ enabled: true, revision: 4 }));
      await first;
    });
  });
  it("после CAS-конфликта сохраняет черновик до явного сброса к актуальным настройкам", async () => {
    const { result } = renderHook(() => useForm());
    const updated = connection({
      revision: 5,
      configuration: {
        ...connection().configuration,
        agent: { ...CODEX_AGENT_SETTINGS_DEFAULTS, model: "server-model" },
      },
    });
    mocks.catalog.mockResolvedValue({ connections: [updated] });
    mocks.save.mockRejectedValueOnce(
      new RealizeAIRequestError("Конфликт", { status: 409, code: "CONFLICT" }),
    );
    act(() => result.current.form.update({ model: "draft-model" }));
    await act(() => result.current.form.save());
    expect(result.current.form.settings.model).toBe("draft-model");
    expect(result.current.form.isConflicted).toBe(true);
    expect(result.current.form.hasRetry).toBe(false);
    act(() => result.current.form.reset());
    expect(result.current.form.settings.model).toBe("server-model");
    expect(result.current.form.isDirty).toBe(false);
  });
  it("отмечает конфликт ревизии даже без изменения настроек агента", async () => {
    const { result } = renderHook(() => useForm());
    mocks.catalog.mockResolvedValue({
      connections: [connection({ revision: 4 })],
    });
    mocks.save.mockRejectedValueOnce(
      new RealizeAIRequestError("Конфликт", { status: 409, code: "CONFLICT" }),
    );
    act(() => result.current.form.setEnabled(true));
    await act(() => result.current.form.save());
    expect(result.current.form.isConflicted).toBe(true);
    expect(result.current.form.enabled).toBe(true);
    act(() => result.current.form.reset());
    act(() => result.current.form.setEnabled(true));
    mocks.save.mockResolvedValueOnce(
      connection({ enabled: true, revision: 5 }),
    );
    await act(() => result.current.form.save());
    expect(mocks.save.mock.calls[1][0].expectedRevision).toBe(4);
  });
  it("сохранённый переключатель доступен по подписи, advanced содержит единицы и отдельную модель проверки", () => {
    const { result } = renderHook(() => useForm());
    const { rerender } = render(
      createElement(CodexAgentSettingsView, { form: result.current.form }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: /Админский агент включён/ }),
    );
    rerender(
      createElement(CodexAgentSettingsView, { form: result.current.form }),
    );
    expect(result.current.form.enabled).toBe(true);
    expect(screen.getByLabelText(/^Модель агента/)).toBeTruthy();
    fireEvent.click(screen.getByText("Настроить модель проверки и сроки"));
    expect(screen.getByLabelText(/^Модель проверяющего/)).toBeTruthy();
    expect(
      screen
        .getByLabelText(/^Срок разрешения на выполнение, секунды/)
        .getAttribute("min"),
    ).toBe("60");
    expect(
      screen
        .getByLabelText(/^Срок предварительного просмотра, секунды/)
        .getAttribute("min"),
    ).toBe("900");
  });
  it("открывает вкладку агента из URL и сохраняет выбор без перезагрузки", () => {
    window.history.replaceState(null, "", "/admin/integrations/codex#agent");
    const { result } = renderHook(useCodexIntegrationTab);
    expect(result.current.tab).toBe("agent");
    act(() => result.current.setTab("chat"));
    expect(window.location.hash).toBe("#chat");
    expect(result.current.tab).toBe("chat");
  });
});

describe("Обновление доступности агента", () => {
  it("выключает и включает готовность после сохранения и focus без повторной загрузки истории", async () => {
    mocks.request.mockResolvedValue({ state: "ready", enabled: true });
    const { result } = renderHook(() => useAdminAgentRuntime(true));
    await waitFor(() => expect(result.current?.state).toBe("ready"));
    mocks.request.mockResolvedValue({ state: "disabled", enabled: false });
    act(() => window.dispatchEvent(new Event(CHAT_SETTINGS_UPDATED_EVENT)));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current?.state).toBe("disabled"));
    mocks.request.mockResolvedValue({ state: "ready", enabled: true });
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(result.current?.state).toBe("ready"));
    expect(mocks.request.mock.calls.every(([path]) => path === "/status")).toBe(
      true,
    );
  });
  it("поздний ready не перезаписывает результат выключения", async () => {
    let first!: (value: unknown) => void;
    mocks.request.mockReturnValueOnce(
      new Promise((resolve) => {
        first = resolve;
      }),
    );
    const { result } = renderHook(() => useAdminAgentRuntime(true));
    mocks.request.mockResolvedValue({ state: "disabled", enabled: false });
    act(() => window.dispatchEvent(new Event(CHAT_SETTINGS_UPDATED_EVENT)));
    await waitFor(() => expect(result.current?.state).toBe("disabled"));
    await act(async () => first({ state: "ready", enabled: true }));
    expect(result.current?.state).toBe("disabled");
  });
  it("ошибка статуса не оставляет прежнюю готовность и скрытый чат не слушает события", async () => {
    mocks.request.mockResolvedValue({ state: "ready", enabled: true });
    const { result, rerender } = renderHook(
      ({ enabled }) => useAdminAgentRuntime(enabled),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current?.state).toBe("ready"));
    mocks.request.mockRejectedValue(new Error("Offline"));
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(result.current).toBeUndefined());
    rerender({ enabled: false });
    const count = mocks.request.mock.calls.length;
    act(() => window.dispatchEvent(new Event(CHAT_SETTINGS_UPDATED_EVENT)));
    expect(mocks.request).toHaveBeenCalledTimes(count);
  });
});
