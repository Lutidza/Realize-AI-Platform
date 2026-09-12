/**
 * @file tests/int/aiDeepLinks.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет исторические ссылки, защиту незавершённых запросов и сохранность черновиков.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealizeAIController } from "../../packages/payload-ai-plugin/src/admin/RealizeAIController.types";
import type { AgentLayerDeepLinkOptions } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerDeepLink.types";
import {
  buildAIConfigurationURL,
  buildAIConversationURL,
  readAIRecordLinkID,
} from "../../packages/payload-ai-plugin/src/admin/realizeAILinks.util";
import { parseAgentLayerDeepLink } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/parseAgentLayerDeepLink.validator";
import { useAgentLayerDeepLink } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerDeepLink.hook";
import { useAgentLayerReleaseInspector } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerReleaseInspector.hook";
import { useChatDeepLink } from "../../packages/payload-ai-plugin/src/admin/chat-presentation/useChatDeepLink.hook";
import { createAIConfigReleaseFixture } from "./fixtures/aiConfiguration";

const location = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation.js", () => ({
  useSearchParams: () => new URLSearchParams(location.query),
}));
beforeEach(() => {
  location.query = "";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AI deep link boundaries", () => {
  it("preserves installation routes and encodes parameter values separately", () => {
    expect(buildAIConversationURL("/cms/assistant/", "chat/1?x=2")).toBe(
      "/cms/assistant?conversation=chat%2F1%3Fx%3D2",
    );
    expect(
      buildAIConfigurationURL("/cms/assistant/settings/", "release.1", {
        kind: "workflow_definition",
        key: "catalog-edit",
      }),
    ).toBe(
      "/cms/assistant/settings?release=release.1&kind=workflow_definition&key=catalog-edit",
    );
    expect(
      parseAgentLayerDeepLink(
        new URLSearchParams("release=release.1&kind=agent_profile&key=admin"),
      ),
    ).toEqual({
      releaseID: "release.1",
      artifact: { kind: "agent_profile", key: "admin" },
    });
  });
  it.each([
    "release=",
    "release=a&release=b",
    "release=../private",
    "kind=agent_profile&key=admin",
    "release=a&key=admin",
    "release=a&kind=agent_profile",
    "release=a&kind=__proto__&key=x",
    "release=a&kind=agent_profile&kind=skill&key=x",
    `release=${"a".repeat(129)}`,
  ])("rejects invalid configuration link %s without fallback", (query) => {
    expect(() => parseAgentLayerDeepLink(new URLSearchParams(query))).toThrow();
  });
  it("ignores unrelated query and supports the exact release without a record", () => {
    expect(
      parseAgentLayerDeepLink(new URLSearchParams("other=value")),
    ).toBeUndefined();
    expect(parseAgentLayerDeepLink(new URLSearchParams("release=old"))).toEqual(
      { releaseID: "old" },
    );
    expect(() =>
      readAIRecordLinkID(
        new URLSearchParams("conversation=a&conversation=b"),
        "conversation",
      ),
    ).toThrow();
  });
});

const chat = () => ({
  selectedConversationID: "previous",
  draft: "Несохранённый текст",
  isSubmitting: false,
  isCreatingConversation: false,
  pendingWorkflowConversationID: undefined,
  workflow: { isPending: false, hasRetry: false },
  openConversation: vi.fn(async (_id: string) => {}),
  setDraft: vi.fn(),
  context: { restoreContext: vi.fn() },
});

describe("chat link consumer", () => {
  it("opens once through the existing owner without clearing text or context", async () => {
    location.query = "conversation=target";
    const controller = chat();
    const onNotice = vi.fn();
    const { rerender } = renderHook(() =>
      useChatDeepLink({
        controller: controller as unknown as RealizeAIController,
        enabled: true,
        onNotice,
      }),
    );
    await waitFor(() =>
      expect(controller.openConversation).toHaveBeenCalledWith("target"),
    );
    rerender();
    expect(controller.openConversation).toHaveBeenCalledTimes(1);
    expect(controller.setDraft).not.toHaveBeenCalled();
    expect(controller.context.restoreContext).not.toHaveBeenCalled();
    expect(controller.draft).toBe("Несохранённый текст");
  });
  it("defers a link while the exact workflow retry is unresolved", async () => {
    location.query = "conversation=target";
    const controller = chat();
    controller.workflow.hasRetry = true;
    const onNotice = vi.fn();
    const { rerender } = renderHook(() =>
      useChatDeepLink({
        controller: controller as unknown as RealizeAIController,
        enabled: true,
        onNotice,
      }),
    );
    expect(controller.openConversation).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledWith(
      expect.stringContaining("неподтверждённого"),
    );
    controller.workflow.hasRetry = false;
    rerender();
    await waitFor(() =>
      expect(controller.openConversation).toHaveBeenCalledWith("target"),
    );
    expect(onNotice).toHaveBeenLastCalledWith(undefined);
  });
  it("rejects malformed conversation links before invoking the owner", () => {
    location.query = "conversation=bad/path";
    const controller = chat();
    const onNotice = vi.fn();
    renderHook(() =>
      useChatDeepLink({
        controller: controller as unknown as RealizeAIController,
        enabled: true,
        onNotice,
      }),
    );
    expect(controller.openConversation).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledWith(
      expect.stringContaining("некорректный"),
    );
  });
  it("does not process links in a hidden host and reports a denied read", async () => {
    location.query = "conversation=foreign";
    const controller = chat();
    controller.openConversation.mockRejectedValue(new Error("denied"));
    const onNotice = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) =>
        useChatDeepLink({
          controller: controller as unknown as RealizeAIController,
          enabled,
          onNotice,
        }),
      { initialProps: { enabled: false } },
    );
    expect(controller.openConversation).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith(
        expect.stringContaining("Проверьте доступ"),
      ),
    );
  });
});

const configuration = (): AgentLayerDeepLinkOptions => ({
  ready: true,
  busy: false,
  dirty: false,
  pending: false,
  openRelease: vi.fn(async () => true),
});

describe("historical release link consumer", () => {
  it("loads the specified release and record once after bootstrap", async () => {
    location.query = "release=historic&kind=workflow_definition&key=flow";
    const options = configuration();
    options.ready = false;
    const { rerender } = renderHook(() => useAgentLayerDeepLink(options));
    expect(options.openRelease).not.toHaveBeenCalled();
    options.ready = true;
    rerender();
    await waitFor(() =>
      expect(options.openRelease).toHaveBeenCalledWith("historic", {
        kind: "workflow_definition",
        key: "flow",
      }),
    );
    rerender();
    expect(options.openRelease).toHaveBeenCalledTimes(1);
    location.query = "release=another";
    rerender();
    await waitFor(() =>
      expect(options.openRelease).toHaveBeenCalledWith("another", undefined),
    );
  });
  it.each(["dirty", "pending"] as const)(
    "preserves %s work before opening the requested release",
    async (property) => {
      location.query = "release=historic";
      const options = configuration();
      options[property] = true;
      const { result, rerender } = renderHook(() =>
        useAgentLayerDeepLink(options),
      );
      await waitFor(() => expect(result.current.error).toContain("сохранение"));
      expect(options.openRelease).not.toHaveBeenCalled();
      options[property] = false;
      rerender();
      await waitFor(() => expect(options.openRelease).toHaveBeenCalledTimes(1));
    },
  );
  it("reports a failed historical read and retries it without selecting an active release", async () => {
    location.query = "release=historic";
    const options = configuration();
    vi.mocked(options.openRelease).mockResolvedValueOnce(false);
    const { result } = renderHook(() => useAgentLayerDeepLink(options));
    await waitFor(() =>
      expect(result.current.error).toContain("указанный выпуск"),
    );
    act(() => result.current.retry());
    await waitFor(() => expect(options.openRelease).toHaveBeenCalledTimes(2));
    expect(options.openRelease).toHaveBeenLastCalledWith("historic", undefined);
  });
  it("selects only the requested immutable artifact and exposes a missing target", () => {
    const release = createAIConfigReleaseFixture();
    const artifact = release.artifacts.find(
      (item) => item.artifact.kind === "workflow_definition",
    )!.artifact;
    const { result } = renderHook(() =>
      useAgentLayerReleaseInspector(release, {
        kind: artifact.kind,
        key: artifact.key,
      }),
    );
    expect(result.current.selected).toEqual(artifact);
    expect(result.current.missingTarget).toBe(false);
    const missing = renderHook(() =>
      useAgentLayerReleaseInspector(release, {
        kind: "workflow_definition",
        key: "missing",
      }),
    );
    expect(missing.result.current.selected).toBeUndefined();
    expect(missing.result.current.missingTarget).toBe(true);
  });
});
