/**
 * @file tests/int/agentLayerReleaseLifecycle.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет выпуск, общий lock, точный retry и конфликт активации в рабочей области.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActiveAIConfigPointer,
  AIConfigDraftDTO,
  AIConfigReleaseDTO,
} from "@realize/ai-contracts";
import { useAgentLayerConfiguration } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerConfiguration.hook";
import { useAgentLayerEditor } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerEditor.hook";
import { useAgentLayerWorkspace } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerWorkspace.hook";
import {
  agentLayerBootstrap,
  agentLayerDraft,
  agentLayerRule,
} from "./fixtures/agentLayerConfiguration";

let draft: AIConfigDraftDTO;
let activePointer: ActiveAIConfigPointer | null;
let release: AIConfigReleaseDTO;
let loseReply: boolean;
let failRead: boolean;
const requests: { url: string; body: string; key: string }[] = [];
const receipts = new Map<string, unknown>();
const envelope = (data: unknown) =>
  Response.json({ ok: true, data, correlationID: "fixture" });
const summary = () => {
  const { artifacts, ...metadata } = release;
  return { ...metadata, artifactCount: artifacts.length };
};
beforeEach(() => {
  draft = { ...structuredClone(agentLayerDraft), state: "ready", revision: 3 };
  activePointer = null;
  release = {
    id: "release-7",
    version: 7,
    manifestHash: "c".repeat(64),
    schemaVersion: "1.0",
    sourceDraftID: draft.id,
    sourceDraftRevision: 3,
    createdAt: draft.createdAt,
    createdBy: "fixture",
    systemCompatibility: { minimumRelease: "1.0.0", maximumRelease: "1.0.0" },
    artifacts: draft.artifacts.map((artifact) => ({
      artifact,
      contentHash: "d".repeat(64),
    })),
  };
  loseReply = false;
  failRead = false;
  requests.length = 0;
  receipts.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = String(init.body);
        const key = new Headers(init.headers).get("Idempotency-Key")!;
        requests.push({ url, body, key });
        if (receipts.has(key)) return envelope(receipts.get(key));
        const input = JSON.parse(body);
        let receipt: unknown;
        if (url.endsWith("/config/releases")) {
          draft = { ...draft, state: "released", revision: 4 };
          receipt = summary();
        } else if (url.endsWith("/config/activate")) {
          if (input.expectedPointerVersion !== (activePointer?.version ?? 0))
            return Response.json(
              {
                ok: false,
                error: { code: "CONFLICT", message: "Pointer changed" },
                correlationID: "fixture",
              },
              { status: 409 },
            );
          activePointer = {
            releaseID: input.releaseID,
            manifestHash: input.expectedReleaseManifestHash,
            version: input.expectedPointerVersion + 1,
            activatedAt: draft.createdAt,
            activatedBy: "fixture",
          };
          receipt = activePointer;
        } else throw new Error(`Unexpected mutation ${url}`);
        receipts.set(key, receipt);
        if (loseReply) {
          loseReply = false;
          throw new TypeError("Lost committed reply");
        }
        return envelope(receipt);
      }
      if (failRead && requests.length) {
        failRead = false;
        throw new TypeError("Read unavailable");
      }
      if (url.endsWith("/config"))
        return envelope({
          ...agentLayerBootstrap,
          drafts: [draft],
          releases: [summary()],
          activePointer,
        });
      if (url.includes("/config/releases/")) return envelope(release);
      if (url.includes("/config/drafts/")) return envelope(draft);
      throw new Error(`Unexpected read ${url}`);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const renderWorkspace = () =>
  renderHook(() => {
    const configuration = useAgentLayerConfiguration();
    const editor = useAgentLayerEditor({ configuration });
    return {
      configuration,
      editor,
      workspace: useAgentLayerWorkspace({ configuration, editor }),
    };
  });
describe("выпуск и активация из рабочей области", () => {
  it("готовый черновик после загрузки выпускается без локального validation receipt и открывается для просмотра", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    expect(result.current.configuration.validation).toBeUndefined();
    await act(() => result.current.workspace.createRelease());
    expect(result.current.workspace.isViewingRelease).toBe(true);
    expect(result.current.configuration.release?.id).toBe("release-7");
    expect(result.current.editor.isReadOnly).toBe(true);
    expect(activePointer).toBeNull();
    expect(JSON.parse(requests[0]!.body)).toMatchObject({
      expectedDraftRevision: 3,
      expectedSystemManifestHash: agentLayerBootstrap.system.manifestHash,
    });
  });
  it("не выпускает черновик с несохранённой формой", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.openArtifact(agentLayerRule));
    act(() => result.current.editor.update("instruction", "Новый текст"));
    await act(() => result.current.workspace.createRelease());
    expect(requests).toHaveLength(0);
    expect(result.current.editor.form?.fields.instruction).toBe("Новый текст");
  });
  it("после потери ответа повторяет тот же выпуск, блокируя смену раздела, а затем показывает созданный результат", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    loseReply = true;
    await act(() => result.current.workspace.createRelease());
    expect(result.current.editor.isLocked).toBe(true);
    act(() => result.current.workspace.selectSection("skill"));
    expect(result.current.workspace.section).toBe("versions");
    await act(() => result.current.editor.retry());
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(result.current.configuration.hasPendingMutation).toBe(false);
    expect(result.current.workspace.isViewingRelease).toBe(true);
    expect(result.current.configuration.release?.id).toBe("release-7");
  });
  it("подтверждённый выпуск после неудачного чтения перечитывает без второго POST", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    failRead = true;
    await act(() => result.current.workspace.createRelease());
    await act(() => result.current.editor.retry());
    expect(requests).toHaveLength(1);
    expect(result.current.configuration.release?.id).toBe("release-7");
  });
  it("CAS конфликт не меняет ожидаемую версию и не повторяет активацию автоматически", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    await act(() => result.current.workspace.openRelease(release.id));
    activePointer = {
      releaseID: "release-other",
      manifestHash: "e".repeat(64),
      version: 5,
      activatedAt: draft.createdAt,
      activatedBy: "other",
    };
    await act(() => result.current.configuration.activateRelease("activate"));
    expect(result.current.configuration.errorKind).toBe("conflict");
    expect(result.current.configuration.hasPendingMutation).toBe(false);
    expect(result.current.configuration.release?.id).toBe("release-7");
    await act(() => result.current.editor.retry());
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0]!.body).expectedPointerVersion).toBe(0);
    expect(activePointer.version).toBe(5);
    await act(() => result.current.workspace.refresh());
    expect(result.current.workspace.isViewingRelease).toBe(true);
    expect(result.current.configuration.release?.id).toBe("release-7");
    expect(result.current.configuration.bootstrap?.activePointer?.version).toBe(
      5,
    );
  });
  it("exact replay активации сохраняет более новый указатель из bootstrap", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    await act(() => result.current.workspace.openRelease(release.id));
    loseReply = true;
    await act(() => result.current.configuration.activateRelease("activate"));
    activePointer = {
      releaseID: "release-other",
      manifestHash: "e".repeat(64),
      version: 2,
      activatedAt: draft.createdAt,
      activatedBy: "other",
    };
    await act(() => result.current.editor.retry());
    expect(requests[1]).toEqual(requests[0]);
    expect(
      result.current.configuration.bootstrap?.activePointer?.releaseID,
    ).toBe("release-other");
    expect(result.current.configuration.notice).toContain("уже изменён");
    expect(result.current.configuration.hasPendingMutation).toBe(false);
  });
});
