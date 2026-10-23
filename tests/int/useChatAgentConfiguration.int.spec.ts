/**
 * @file tests/int/useChatAgentConfiguration.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Проверяет блокировку инженерного запуска при потере исполнителя и сохранение выбора профиля.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  OWNER_ENGINEERING_PROFILE_KEY,
  type AIChatConfigurationCatalogDTO,
} from "@realize/ai-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatAgentConfiguration } from "../../packages/payload-ai-plugin/src/admin/chat/useChatAgentConfiguration.hook";

const request = vi.hoisted(() => vi.fn());
vi.mock("../../packages/payload-ai-plugin/src/admin/realizeAIAPI", () => ({
  requestRealizeAI: request,
}));

const catalog = (available = true): AIChatConfigurationCatalogDTO => ({
  activePointer: null,
  release: { id: "release-1", version: 1, manifestHash: "manifest-1" },
  ownerEngineering: available
    ? {
        enabled: true,
        mode: "owner-host",
        hostname: "fixture-machine",
        osUser: "fixture-owner",
        workspaceRoot: "/fixture/workspace",
      }
    : null,
  profiles: [OWNER_ENGINEERING_PROFILE_KEY, "admin"].map((key) => ({
    key,
    title: key,
    description: "",
    locale: "ru",
  })),
});

beforeEach(() => request.mockReset());
afterEach(cleanup);

describe("owner engineering next-run selection", () => {
  it("blocks unavailable executor without preventing an ordinary profile choice", async () => {
    request.mockResolvedValue(catalog(false));
    const { result } = renderHook(() => useChatAgentConfiguration(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.selectProfile(OWNER_ENGINEERING_PROFILE_KEY));
    expect(result.current.isReady).toBe(false);
    expect(result.current.error).toBeUndefined();

    act(() => result.current.selectProfile("admin"));
    expect(result.current.selection?.profileKey).toBe("admin");
    expect(result.current.isReady).toBe(true);
  });

  it("retains exact selection after executor loss and allows it again after refresh", async () => {
    request.mockResolvedValue(catalog());
    const { result } = renderHook(() => useChatAgentConfiguration(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.selectProfile(OWNER_ENGINEERING_PROFILE_KEY));
    const selected = result.current.selection;
    expect(result.current.isReady).toBe(true);

    const unavailable = catalog(false);
    unavailable.profiles = unavailable.profiles.filter(
      ({ key }) => key !== OWNER_ENGINEERING_PROFILE_KEY,
    );
    request.mockResolvedValueOnce(unavailable);
    await act(async () => result.current.refresh());
    expect(result.current.isReady).toBe(false);
    expect(result.current.selection).toEqual(selected);

    await act(async () => result.current.refresh());
    expect(result.current.isReady).toBe(true);
    expect(result.current.selection).toEqual(selected);
  });

  it("requires current executor metadata for a restored owner selection", async () => {
    const withoutMetadata = catalog();
    delete withoutMetadata.ownerEngineering;
    request.mockResolvedValue(withoutMetadata);
    const { result } = renderHook(() => useChatAgentConfiguration(true));
    act(() =>
      result.current.restoreSelection({
        releaseID: "release-1",
        manifestHash: "manifest-1",
        profileKey: OWNER_ENGINEERING_PROFILE_KEY,
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isReady).toBe(false);
    expect(result.current.selection?.profileKey).toBe(
      OWNER_ENGINEERING_PROFILE_KEY,
    );
  });

  it("does not make a stale release ready merely because the executor is available", async () => {
    request.mockResolvedValue(catalog());
    const { result } = renderHook(() => useChatAgentConfiguration(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() =>
      result.current.restoreSelection({
        releaseID: "old-release",
        manifestHash: "old-manifest",
        profileKey: OWNER_ENGINEERING_PROFILE_KEY,
      }),
    );
    expect(result.current.isReady).toBe(false);
  });
});
