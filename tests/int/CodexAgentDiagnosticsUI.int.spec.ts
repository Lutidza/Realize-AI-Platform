/**
 * @file tests/int/CodexAgentDiagnosticsUI.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Защищает актуальность диагностики и существующую проверку доступа от потери черновика и повторных запросов.
 */

import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCodexIntegrationConfiguration } from "@realize/ai-contracts";
import type {
  CodexAgentDiagnosticsDTO,
  CodexIntegrationConnectionDTO,
} from "@realize/ai-contracts";
import { CodexAgentDiagnosticsView } from "../../packages/payload-ai-plugin/src/admin/integrations/codex/CodexAgentDiagnostics.view";
import { useCodexAgentDiagnostics } from "../../packages/payload-ai-plugin/src/admin/integrations/codex/useCodexAgentDiagnostics.hook";
import { useCodexIntegrationPanel } from "../../packages/payload-ai-plugin/src/admin/integrations/codex/useCodexIntegrationPanel.hook";

const mocks = vi.hoisted(() => ({
  diagnostics: vi.fn(),
  test: vi.fn(),
  catalog: vi.fn(),
  save: vi.fn(),
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/admin/integrations/codex/codexIntegrationAPI.adapter",
  () => ({
    codexIntegrationAPI: {
      diagnostics: mocks.diagnostics,
      test: mocks.test,
      saveAgentSettings: mocks.save,
    },
  }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/admin/integrations/integrationAPI",
  () => ({ loadIntegrationCatalog: mocks.catalog }),
);

const connection = (revision = 3): CodexIntegrationConnectionDTO => ({
  id: "codex",
  connectionKey: "codex:primary",
  provider: "codex",
  enabled: true,
  displayName: "Подключение CMS",
  hasCredential: true,
  lastTestStatus: "never",
  revision,
  updatedAt: "2026-09-11T10:00:00Z",
  configuration: parseCodexIntegrationConfiguration({ authMode: "chatgpt" }),
});
const snapshot = (revision = 3): CodexAgentDiagnosticsDTO => ({
  checkedAt: "2026-09-11T12:00:00Z",
  runtime: { enabled: true, mode: "central-control-plane", state: "ready" },
  connection: {
    connectionKey: "codex:primary",
    displayName: "Подключение CMS",
    revision,
    authMode: "chatgpt",
  },
  models: { model: "", reviewModel: "" },
  accessTest: { status: "never" },
  worker: {
    state: "unavailable",
    reason: "Исполнитель не отправлял сигнал готовности.",
    lastSeenAt: null,
    activeCount: 0,
    busyCount: 0,
    currentJob: null,
  },
  operations: {
    execution: {
      state: "allowed",
      reason: "Выполнение разрешено настройками.",
    },
    preview: { state: "blocked", reason: "Включите предварительный просмотр." },
    release: { state: "disabled", reason: "Выключено в настройках агента." },
    sourcePromotion: {
      state: "blocked",
      reason: "Проверьте подключение GitHub.",
    },
  },
});
const panelProps = () => ({
  connection: connection(),
  isReloading: false,
  vaultConfigured: true,
  onConnectionChange: vi.fn(),
  onBusyChange: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.diagnostics.mockReset().mockResolvedValue(snapshot());
  mocks.test.mockReset();
  mocks.save.mockReset();
  mocks.catalog.mockReset().mockResolvedValue({ connections: [connection(4)] });
  window.history.replaceState(null, "", "/admin/integrations/codex#agent");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Диагностика админского агента", () => {
  it("читает состояние только на активной вкладке и снимает focus listener при выходе", async () => {
    const { result, rerender } = renderHook(
      ({ active }) =>
        useCodexAgentDiagnostics({ active, connection: connection() }),
      { initialProps: { active: false } },
    );
    act(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.diagnostics).not.toHaveBeenCalled();
    rerender({ active: true });
    await waitFor(() =>
      expect(result.current.diagnostics?.runtime.state).toBe("ready"),
    );
    rerender({ active: false });
    act(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.diagnostics).toHaveBeenCalledTimes(1);
    expect(result.current.diagnostics).toBeUndefined();
  });

  it("поздний ready прежней ревизии не заменяет свежий disabled", async () => {
    let complete!: (data: CodexAgentDiagnosticsDTO) => void;
    mocks.diagnostics.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const { result, rerender } = renderHook(
      ({ revision }) =>
        useCodexAgentDiagnostics({
          active: true,
          connection: connection(revision),
        }),
      { initialProps: { revision: 3 } },
    );
    const next = {
      ...snapshot(4),
      runtime: {
        ...snapshot().runtime,
        enabled: false,
        state: "disabled" as const,
      },
    };
    mocks.diagnostics.mockResolvedValueOnce(next);
    rerender({ revision: 4 });
    expect(mocks.diagnostics.mock.calls[0][0].aborted).toBe(true);
    expect(result.current.diagnostics).toBeUndefined();
    await waitFor(() =>
      expect(result.current.diagnostics?.runtime.state).toBe("disabled"),
    );
    await act(async () => complete(snapshot()));
    expect(result.current.diagnostics).toEqual(next);
  });

  it("ошибка focus обновления скрывает прежнюю готовность и допускает повторное чтение", async () => {
    const { result } = renderHook(() =>
      useCodexAgentDiagnostics({ active: true, connection: connection() }),
    );
    await waitFor(() => expect(result.current.diagnostics).toBeDefined());
    mocks.diagnostics.mockRejectedValueOnce(new Error("Сервис недоступен"));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(result.current.diagnostics).toBeUndefined();
    await waitFor(() => expect(result.current.error).toBe("Сервис недоступен"));
    act(() => result.current.refresh());
    await waitFor(() =>
      expect(result.current.diagnostics?.runtime.state).toBe("ready"),
    );
    expect(result.current.error).toBeUndefined();
  });

  it("показывает отсутствие исполнителя отдельно от доступности чата и проверки аккаунта", () => {
    const { container } = render(
      createElement(CodexAgentDiagnosticsView, {
        state: {
          diagnostics: snapshot(),
          isLoading: false,
          error: undefined,
          refresh: vi.fn(),
        },
        onTest: vi.fn(),
        isTesting: false,
        isTestDisabled: false,
      }),
    );
    expect(screen.getByText("Готов к работе в чате")).toBeTruthy();
    expect(screen.getByText("Ещё не выполнялась")).toBeTruthy();
    expect(screen.getByText("Выбор провайдера")).toBeTruthy();
    expect(screen.getByText("Как у агента")).toBeTruthy();
    expect(screen.getByText("Разрешено")).toBeTruthy();
    expect(screen.getByText("Исполнитель недоступен")).toBeTruthy();
    expect(screen.getByText(snapshot().worker.reason)).toBeTruthy();
    expect(screen.getByText("Ещё не получен")).toBeTruthy();
    expect(container.querySelectorAll("time")).toHaveLength(1);
    expect(container.querySelector("time")?.dateTime).toBe(
      snapshot().checkedAt,
    );
  });

  it("обновляет heartbeat без мерцания и пересечения запросов и останавливает чтение при выходе", async () => {
    const { result, unmount } = renderHook(() =>
      useCodexAgentDiagnostics({ active: true, connection: connection() }),
    );
    await waitFor(() => expect(result.current.diagnostics).toBeDefined());
    vi.useFakeTimers();
    // Следующее ручное чтение создаёт таймер уже под управлением fake timers.
    await act(async () => result.current.refresh());
    let complete!: (value: CodexAgentDiagnosticsDTO) => void;
    mocks.diagnostics.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(mocks.diagnostics).toHaveBeenCalledTimes(3);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.diagnostics?.worker.state).toBe("unavailable");
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(mocks.diagnostics).toHaveBeenCalledTimes(3);
    await act(async () =>
      complete({
        ...snapshot(),
        worker: {
          state: "busy",
          reason: "Исполнитель выполняет задание.",
          lastSeenAt: "2026-09-11T12:00:10Z",
          activeCount: 1,
          busyCount: 1,
          currentJob: { kind: "execution", changeRequestID: "15" },
        },
      }),
    );
    expect(result.current.diagnostics?.worker.state).toBe("busy");
    mocks.diagnostics.mockReturnValueOnce(new Promise(() => {}));
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    const signal = mocks.diagnostics.mock.calls.at(-1)?.[0] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(mocks.diagnostics).toHaveBeenCalledTimes(4);
  });

  it("не оставляет прежнюю готовность при зависшем чтении и восстанавливается после таймаута", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useCodexAgentDiagnostics({ active: true, connection: connection() }),
    );
    await act(async () => {});
    expect(result.current.diagnostics).toBeDefined();
    let complete!: (value: CodexAgentDiagnosticsDTO) => void;
    mocks.diagnostics.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    const signal = mocks.diagnostics.mock.calls.at(-1)?.[0] as AbortSignal;
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(signal.aborted).toBe(true);
    expect(result.current.diagnostics).toBeUndefined();
    expect(result.current.error).toContain(
      "Актуальное состояние агента неизвестно",
    );
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(result.current.error).toBeUndefined();
    const recovered = result.current.diagnostics;
    await act(async () =>
      complete({
        ...snapshot(),
        worker: { ...snapshot().worker, state: "available" },
      }),
    );
    expect(result.current.diagnostics).toBe(recovered);
  });

  it("отменяет чтение в скрытом документе и не принимает поздний ответ после возобновления", async () => {
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    let complete!: (value: CodexAgentDiagnosticsDTO) => void;
    mocks.diagnostics.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useCodexAgentDiagnostics({ active: true, connection: connection() }),
    );
    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(mocks.diagnostics.mock.calls[0][0].aborted).toBe(true);
    hidden = false;
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    const fresh = result.current.diagnostics;
    await act(async () =>
      complete({
        ...snapshot(),
        worker: {
          ...snapshot().worker,
          state: "available",
        },
      }),
    );
    expect(result.current.diagnostics).toBe(fresh);
    expect(result.current.diagnostics?.worker.state).toBe("unavailable");
  });

  it("при возвращении на скрытую вкладку не показывает прежнюю готовность до свежего ответа", async () => {
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    mocks.diagnostics.mockResolvedValueOnce({
      ...snapshot(),
      worker: { ...snapshot().worker, state: "available" },
    });
    const { result } = renderHook(() =>
      useCodexAgentDiagnostics({ active: true, connection: connection() }),
    );
    await waitFor(() =>
      expect(result.current.diagnostics?.worker.state).toBe("available"),
    );
    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    let complete!: (value: CodexAgentDiagnosticsDTO) => void;
    mocks.diagnostics.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current.diagnostics).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
    await act(async () => complete(snapshot()));
    expect(result.current.diagnostics?.worker.state).toBe("unavailable");
  });

  it("показывает занятого исполнителя, последний сигнал и текущее задание", () => {
    const diagnostics = {
      ...snapshot(),
      worker: {
        state: "busy" as const,
        reason: "Все исполнители заняты.",
        lastSeenAt: "2026-09-11T12:00:10Z",
        activeCount: 1,
        busyCount: 1,
        currentJob: { kind: "preview" as const, changeRequestID: "15" },
      },
    };
    const { container } = render(
      createElement(CodexAgentDiagnosticsView, {
        state: {
          diagnostics,
          isLoading: false,
          error: undefined,
          refresh: vi.fn(),
        },
        onTest: vi.fn(),
        isTesting: false,
        isTestDisabled: false,
      }),
    );
    expect(screen.getByText("Исполнитель занят")).toBeTruthy();
    expect(
      screen.getByText("Предварительный просмотр · Запрос №15"),
    ).toBeTruthy();
    expect(
      container.querySelector('time[datetime="2026-09-11T12:00:10Z"]'),
    ).toBeTruthy();
  });

  it("focus не заменяет черновик и проверка доступа заблокирована до его сохранения", async () => {
    const props = panelProps();
    const { result } = renderHook(() => useCodexIntegrationPanel(props));
    await waitFor(() => expect(result.current.isTestDisabled).toBe(false));
    act(() => result.current.agent.update({ model: "draft-model" }));
    mocks.diagnostics.mockResolvedValueOnce({
      ...snapshot(4),
      models: { model: "server-model", reviewModel: "" },
    });
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() =>
      expect(result.current.diagnostics.diagnostics?.models.model).toBe(
        "server-model",
      ),
    );
    expect(result.current.agent.settings.model).toBe("draft-model");
    expect(result.current.isTestDisabled).toBe(true);
    await act(() => result.current.testAccess());
    expect(mocks.test).not.toHaveBeenCalled();
    expect(props.onConnectionChange).not.toHaveBeenCalled();
  });

  it("не выполняет проверку при неизвестном результате сохранения и общей загрузке", async () => {
    const props = panelProps();
    const { result, rerender } = renderHook(
      ({ isReloading }) => useCodexIntegrationPanel({ ...props, isReloading }),
      { initialProps: { isReloading: true } },
    );
    await waitFor(() =>
      expect(result.current.diagnostics.diagnostics).toBeDefined(),
    );
    await act(() => result.current.testAccess());
    expect(mocks.test).not.toHaveBeenCalled();
    rerender({ isReloading: false });
    act(() => result.current.agent.update({ model: "draft-model" }));
    mocks.save.mockRejectedValueOnce(new Error("Неизвестный результат"));
    await act(() => result.current.agent.save());
    expect(result.current.agent.hasRetry).toBe(true);
    expect(result.current.isTestDisabled).toBe(true);
    await act(() => result.current.testAccess());
    expect(mocks.test).not.toHaveBeenCalled();
  });

  it("переиспользует одну операцию проверки с актуальной ревизией и обновляет каталог и диагностику", async () => {
    mocks.diagnostics.mockResolvedValueOnce(snapshot(5));
    let complete!: (value: unknown) => void;
    mocks.test.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const props = panelProps();
    const { result } = renderHook(() => useCodexIntegrationPanel(props));
    await waitFor(() => expect(result.current.isTestDisabled).toBe(false));
    let request!: Promise<void>;
    act(() => {
      request = result.current.testAccess();
      void result.current.testAccess();
    });
    expect(mocks.test).toHaveBeenCalledExactlyOnceWith({ expectedRevision: 5 });
    expect(result.current.isTestDisabled).toBe(true);
    mocks.diagnostics.mockResolvedValueOnce({
      ...snapshot(6),
      accessTest: { status: "passed", checkedAt: "2026-09-11T13:00:00Z" },
    });
    await act(async () => {
      complete({ status: "passed", message: "Авторизация подтверждена." });
      await request;
    });
    await waitFor(() =>
      expect(result.current.diagnostics.diagnostics?.accessTest.status).toBe(
        "passed",
      ),
    );
    expect(mocks.catalog).toHaveBeenCalledTimes(1);
    expect(props.onConnectionChange).toHaveBeenCalledWith(connection(4));
    expect(result.current.form.operations.testResult?.status).toBe("passed");
  });
});
