/**
 * @file tests/int/useAgentLayerRelease.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет точные команды выпуска, смены указателя и защиту несохранённой формы.
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
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActiveAIConfigPointer,
  AIConfigBootstrapDTO,
  AIConfigDraftDTO,
  AIConfigReleaseDTO,
  AIConfigReleaseSummaryDTO,
} from "@realize/ai-contracts";
import { useAgentLayerConfiguration } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerConfiguration.hook";
import { useAgentLayerEditor } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerEditor.hook";
import { useAgentLayerWorkspace } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerWorkspace.hook";
import { AgentLayerReleaseInspector } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerReleaseInspector.component";
import {
  agentLayerBootstrap,
  agentLayerDraft,
} from "./fixtures/agentLayerConfiguration";
import { createAIConfigReleaseFixture } from "./fixtures/aiConfiguration";

let draft: AIConfigDraftDTO;
let release: AIConfigReleaseDTO;
let bootstrap: AIConfigBootstrapDTO;
let loseReply: boolean;
let failReadback: boolean;
let conflict: boolean;
let writes: number;
const requests: Array<{ url: string; body: string; key: string }> = [];
const receipts = new Map<
  string,
  AIConfigReleaseSummaryDTO | ActiveAIConfigPointer
>();
const envelope = (data: unknown) =>
  Response.json({ ok: true, data, correlationID: "fixture" });
const summary = (value: AIConfigReleaseDTO): AIConfigReleaseSummaryDTO => {
  const { artifacts, ...metadata } = value;
  return { ...metadata, artifactCount: artifacts.length };
};
const useWorkspace = () => {
  const configuration = useAgentLayerConfiguration();
  const editor = useAgentLayerEditor({ configuration });
  const workspace = useAgentLayerWorkspace({ configuration, editor });
  return { configuration, editor, workspace };
};

beforeEach(() => {
  draft = { ...structuredClone(agentLayerDraft), state: "ready" };
  release = {
    ...createAIConfigReleaseFixture(),
    sourceDraftID: draft.id,
    sourceDraftRevision: draft.revision,
  };
  bootstrap = { ...structuredClone(agentLayerBootstrap), drafts: [draft] };
  loseReply = false;
  failReadback = false;
  conflict = false;
  writes = 0;
  requests.length = 0;
  receipts.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = String(init.body);
        const key = new Headers(init.headers).get("Idempotency-Key")!;
        requests.push({ url, body, key });
        if (conflict)
          return Response.json(
            {
              ok: false,
              error: { message: "CAS conflict" },
              correlationID: "fixture",
            },
            { status: 409 },
          );
        if (receipts.has(key)) return envelope(receipts.get(key));
        const input = JSON.parse(body);
        writes++;
        let receipt: AIConfigReleaseSummaryDTO | ActiveAIConfigPointer;
        if (url.endsWith("/config/releases")) {
          draft = { ...draft, revision: draft.revision + 1, state: "released" };
          receipt = summary(release);
          bootstrap = { ...bootstrap, drafts: [draft], releases: [receipt] };
        } else if (url.endsWith("/config/activate")) {
          receipt = {
            activatedAt: "2026-09-10T12:00:00.000Z",
            activatedBy: "fixture",
            version: input.expectedPointerVersion + 1,
            releaseID: input.releaseID,
            manifestHash: input.expectedReleaseManifestHash,
          };
          bootstrap = { ...bootstrap, activePointer: receipt };
        } else throw new Error(`Unexpected request: ${url}`);
        receipts.set(key, receipt);
        if (loseReply) {
          loseReply = false;
          throw new TypeError("Reply lost after commit");
        }
        return envelope(receipt);
      }
      if (writes && failReadback) throw new TypeError("Readback offline");
      if (url.endsWith("/config")) return envelope(bootstrap);
      if (url.includes("/config/drafts/")) return envelope(draft);
      if (url.includes("/config/releases/")) return envelope(release);
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("выпуск и применение конфигурации", () => {
  it("выпускает только сохранённую ready редакцию и открывает неизменяемый результат", async () => {
    const { result } = renderHook(useWorkspace);
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.openArtifact(draft.artifacts[0]!));
    act(() => result.current.editor.update("title", "Несохранённое название"));
    await act(() => result.current.workspace.createRelease());
    expect(requests).toHaveLength(0);
    expect(result.current.editor.isDirty).toBe(true);
    act(() => result.current.editor.update("title", draft.artifacts[0]!.title));
    await act(() => result.current.workspace.createRelease());
    expect(JSON.parse(requests[0]!.body)).toEqual({
      schemaVersion: "1.0",
      draftID: draft.id,
      expectedDraftRevision: 2,
      expectedSystemManifestHash: bootstrap.system.manifestHash,
    });
    expect(result.current.configuration.draft?.state).toBe("released");
    expect(result.current.configuration.release?.id).toBe(release.id);
    expect(result.current.workspace.isViewingRelease).toBe(true);
    expect(result.current.editor.isReadOnly).toBe(true);
    await act(() => result.current.configuration.createRelease());
    expect(requests).toHaveLength(1);
  });

  it("повторяет потерянный ответ с прежним телом и ключом и блокирует другие изменения", async () => {
    const { result } = renderHook(useWorkspace);
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    loseReply = true;
    await act(() => result.current.workspace.createRelease());
    expect(result.current.configuration.hasPendingMutation).toBe(true);
    expect(result.current.editor.isLocked).toBe(true);
    await act(() => result.current.configuration.createDraft());
    await act(() => result.current.configuration.openRelease("other"));
    expect(requests).toHaveLength(1);
    await act(() => result.current.editor.retry());
    expect(requests[1]).toEqual(requests[0]);
    expect(writes).toBe(1);
    expect(result.current.configuration.hasPendingMutation).toBe(false);
    expect(result.current.configuration.release?.id).toBe(release.id);
  });

  it("после подтверждённой записи повторяет только чтение результата", async () => {
    const { result } = renderHook(() => useAgentLayerConfiguration());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    failReadback = true;
    await act(() => result.current.createRelease());
    expect(result.current.error).toContain("подтверждена сервером");
    failReadback = false;
    await act(() => result.current.retryMutation());
    expect(requests).toHaveLength(1);
    expect(result.current.release?.manifestHash).toBe(release.manifestHash);
  });

  it("активация отправляет просмотренный hash и revision указателя, не номер выпуска", async () => {
    bootstrap = {
      ...bootstrap,
      releases: [summary(release)],
      activePointer: {
        activatedAt: "2026-09-10T12:00:00.000Z",
        activatedBy: "fixture",
        version: 9,
        releaseID: "other-release",
        manifestHash: "f".repeat(64),
      },
    };
    const { result } = renderHook(() => useAgentLayerConfiguration());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.activateRelease("activate"));
    expect(requests).toHaveLength(0);
    await act(() => result.current.openRelease(release.id));
    await act(() => result.current.activateRelease("activate"));
    expect(JSON.parse(requests[0]!.body)).toEqual({
      schemaVersion: "1.0",
      action: "activate",
      releaseID: release.id,
      expectedReleaseManifestHash: release.manifestHash,
      expectedPointerVersion: 9,
      expectedSystemManifestHash: bootstrap.system.manifestHash,
    });
    expect(result.current.bootstrap?.activePointer?.version).toBe(10);
    await act(() => result.current.activateRelease("activate"));
    expect(requests).toHaveLength(1);
  });

  it("подтверждает прежнюю активацию после потери ответа и показывает уже сменившийся указатель", async () => {
    const { result } = renderHook(() => useAgentLayerConfiguration());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.openRelease(release.id));
    loseReply = true;
    await act(() => result.current.activateRelease("activate"));
    bootstrap = {
      ...bootstrap,
      activePointer: {
        ...bootstrap.activePointer!,
        version: 2,
        releaseID: "newer",
        manifestHash: "d".repeat(64),
      },
    };
    await act(() => result.current.retryMutation());
    expect(requests[1]).toEqual(requests[0]);
    expect(result.current.bootstrap?.activePointer?.releaseID).toBe("newer");
    expect(result.current.notice).toContain("уже изменён");
  });

  it("после CAS отказа освобождает retry, сохраняя просмотренный выпуск", async () => {
    const { result } = renderHook(() => useAgentLayerConfiguration());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.openRelease(release.id));
    conflict = true;
    await act(() => result.current.activateRelease("rollback"));
    expect(result.current.errorKind).toBe("conflict");
    expect(result.current.hasPendingMutation).toBe(false);
    expect(result.current.release?.id).toBe(release.id);
    await act(() => result.current.retryMutation());
    expect(requests).toHaveLength(1);
  });

  it("предлагает возврат к более раннему выпуску по release.version и передаёт rollback", () => {
    const activeRelease = {
      ...summary(release),
      id: "release-2",
      version: 2,
      manifestHash: "2".repeat(64),
    };
    bootstrap = {
      ...bootstrap,
      releases: [summary(release), activeRelease],
      activePointer: {
        activatedAt: "2026-09-10T12:00:00.000Z",
        activatedBy: "fixture",
        version: 12,
        releaseID: activeRelease.id,
        manifestHash: activeRelease.manifestHash,
      },
    };
    const onActivate = vi.fn();
    render(
      createElement(AgentLayerReleaseInspector, {
        release,
        bootstrap,
        disabled: false,
        onBack: vi.fn(),
        onActivate,
      }),
    );
    expect(screen.getByText("Выпуск 2")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Вернуться к выпуску 1" }),
    );
    expect(onActivate).toHaveBeenCalledWith("rollback");
  });
});
