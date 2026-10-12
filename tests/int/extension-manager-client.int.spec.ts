/**
 * @file tests/int/extension-manager-client.int.spec.ts
 * @version 1.1.1
 * @date 2026-10-12
 * @description Проверяет frozen mutation, lost response, concurrent submit и строгие appearance DTO клиента.
 * @see documentation/specifications/extension-management.md
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
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAssignment,
  ExtensionAppearancePlanDto,
  ExtensionAppearanceReceiptDto,
  ExtensionManagerSnapshotDto,
  PrepareExtensionAppearanceInput,
  AdminShellSnapshotDto,
  AdminShellPlanDto,
  AdminShellReceiptDto,
  InstalledTemplatesSnapshotDto,
} from "@realize/payload-extension-manager/contracts";
import type {
  ExtensionManagerProps,
  ExtensionManagerTransport,
} from "../../src/components/admin/extensions/ExtensionManager.types";
import { ExtensionManagerApi } from "../../src/components/admin/extensions/ExtensionManagerApi.adapter";
import { ExtensionManagerClientError } from "../../src/components/admin/extensions/ExtensionManagerClient.error";
import { useExtensionCommand } from "../../src/components/admin/extensions/useExtensionCommand.hook";
import { useExtensionManager } from "../../src/components/admin/extensions/useExtensionManager.hook";
import { useAdminShellManager } from "../../src/components/admin/extensions/useAdminShellManager.hook";
import { useExtensionMutationLock } from "../../src/components/admin/extensions/useExtensionMutationLock.hook";
import { AdminShellApi } from "../../src/components/admin/extensions/AdminShellApi.adapter";
import type { AdminShellTransport } from "../../src/components/admin/extensions/AdminShellPicker.types";
import { useInstalledTemplates } from "../../src/components/admin/extensions/useInstalledTemplates.hook";
import { InstalledTemplatesApi } from "../../src/components/admin/extensions/InstalledTemplatesApi.adapter";
import { InstalledTemplates } from "../../src/components/admin/extensions/InstalledTemplates.component";
import type { InstalledTemplatesProps } from "../../src/components/admin/extensions/InstalledTemplates.types";

const planId = "dac3107e-4c1f-45e2-9a04-1ca0c972433a";
const assignment: ExtensionAssignment = {
  selection: {
    templateId: "fixture",
    templateVersion: "1.0.0",
    target: "admin",
    paletteId: "base",
    paletteVersion: "1.0.0",
    mode: "light",
  },
  settings: { width: 280, spacing: "spacious" },
  manifestHash: "b".repeat(64),
};
const previous: ExtensionAssignment = {
  ...assignment,
  selection: { ...assignment.selection, mode: "dark" },
  settings: { width: 240, spacing: "compact" },
};
const snapshot: ExtensionManagerSnapshotDto = {
  catalog: {
    schemaVersion: "1.0",
    catalogHash: "a".repeat(64),
    runtimeBuildId: "fixture-build",
    hostCompatibility: {
      contractVersion: "1.0",
      platformVersion: "1.0.0",
      reactVersion: "19.2.8",
      nextVersion: "16.3.1",
    },
    entries: [
      {
        availability: "compiled",
        manifestHash: assignment.manifestHash,
        settingsSchema: {
          type: "object",
          properties: {
            width: { type: "integer", minimum: 220, maximum: 400 },
            spacing: { type: "string", enum: ["spacious", "compact"] },
          },
          additionalProperties: false,
        },
        manifest: {
          schemaVersion: "1.0",
          id: "fixture",
          version: "1.0.0",
          packageName: "@fixture/template",
          displayName: "Тестовый шаблон",
          entries: { admin: "./admin" },
          targets: [
            { target: "admin", screens: ["workspace", "auth", "status"] },
          ],
          compatibility: {
            contractVersion: "1.0",
            platform: { minimum: "1.0.0", maximumExclusive: "2.0.0" },
            react: { minimum: "19.2.8", maximumExclusive: "20.0.0" },
            next: { minimum: "16.3.1", maximumExclusive: "17.0.0" },
          },
          settings: {
            schemaVersion: "1.0.0",
            schemaPath: "settings.schema.json",
            defaults: assignment.settings,
          },
          palettes: [
            {
              id: "base",
              version: "1.0.0",
              label: "Базовая",
              modes: ["light", "dark"],
            },
          ],
          ui: { contractVersion: "1.0", primitives: ["Button", "Input"] },
        },
      },
    ],
  },
  storage: "ready",
  targets: {
    admin: { revision: 4, current: assignment, previous },
    frontend: { revision: 0, current: null, previous: null },
  },
  history: [],
  permissions: { manageAppearance: true, installCode: false },
  codeInstallation: { ready: false, reason: "DELIVERY_ADAPTER_UNAVAILABLE" },
};
const props: ExtensionManagerProps = {
  initialTheme: "light",
  themeCookieName: "fixture-mode",
  currentActor: { id: "actor-1", name: "Участник" },
  appearance: {
    selection: { ...assignment.selection, target: "admin" },
    settings: assignment.settings,
    revision: 4,
    persisted: true,
    storageReady: true,
    requiresRecovery: false,
  },
};
const plan: ExtensionAppearancePlanDto = {
  planId,
  planHash: "c".repeat(64),
  action: "assign",
  target: "admin",
  expectedRevision: 4,
  catalogHash: snapshot.catalog.catalogHash,
  current: assignment,
  desiredAssignment: {
    ...assignment,
    settings: { width: 350, spacing: "compact" },
  },
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 300000).toISOString(),
};
const receipt: ExtensionAppearanceReceiptDto = {
  planId,
  target: "admin",
  appliedRevision: 5,
  assignment: plan.desiredAssignment,
  appliedAt: new Date().toISOString(),
};
const commandInput: PrepareExtensionAppearanceInput = {
  action: "assign",
  target: "admin",
  expectedRevision: 4,
  expectedCatalogHash: snapshot.catalog.catalogHash,
  selection: { ...assignment.selection },
  settings: { width: 350, spacing: "compact" },
};
function transport(): ExtensionManagerTransport {
  return {
    snapshot: vi.fn().mockResolvedValue(snapshot),
    prepare: vi.fn().mockResolvedValue({ plan, replayed: false }),
    apply: vi.fn().mockResolvedValue({ receipt, replayed: false }),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Extension manager: клиентские appearance операции", () => {
  it("сохраняет frozen prepare UUID/payload и draft при неизвестном исходе и смене режима", async () => {
    const api = transport();
    api.prepare = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("lost response"))
      .mockResolvedValueOnce({ plan, replayed: true });
    const { result, rerender } = renderHook(
      (context) => useExtensionManager(context, api),
      { initialProps: props },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() =>
      result.current.setSettings(
        JSON.stringify(
          commandInput.action === "assign" ? commandInput.settings : {},
        ),
      ),
    );
    await act(async () => {
      await result.current.prepare();
    });
    const pending = result.current.pending;
    expect(pending?.state).toBe("uncertain");
    act(() => {
      result.current.setSettings('{"width":399}');
      result.current.setTarget("frontend");
    });
    rerender({ ...props, initialTheme: "dark" });
    expect(result.current.target).toBe("admin");
    expect(JSON.parse(result.current.draft!.settingsText)).toEqual({
      width: 350,
      spacing: "compact",
    });
    expect(result.current.pending?.requestId).toBe(pending!.requestId);
    await act(async () => {
      await result.current.prepare();
    });
    expect(api.prepare).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.retry();
    });
    expect(api.prepare).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(api.prepare).mock.calls;
    expect(calls[1]).toEqual(calls[0]);
    expect(result.current.pending).toBeNull();
    expect(result.current.plan?.planId).toBe(planId);
  });

  it("блокирует concurrent prepare и изменение полей до первого React rerender", async () => {
    const api = transport();
    const pending = deferred<{
      plan: ExtensionAppearancePlanDto;
      replayed: boolean;
    }>();
    api.prepare = vi.fn().mockReturnValue(pending.promise);
    const { result } = renderHook(() => useExtensionManager(props, api));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setSettings('{"width":350,"spacing":"compact"}'));
    let request!: Promise<void>;
    act(() => {
      request = result.current.prepare();
      result.current.setSettings('{"width":399}');
      result.current.setTarget("frontend");
      void result.current.prepare();
    });
    expect(api.prepare).toHaveBeenCalledTimes(1);
    expect(result.current.target).toBe("admin");
    expect(JSON.parse(result.current.draft!.settingsText).width).toBe(350);
    await act(async () => {
      pending.resolve({ plan, replayed: false });
      await request;
    });
  });

  it("apply retry не меняет UUID/plan hash после lost response и обновления snapshot", async () => {
    const api = transport();
    const applied = {
      ...snapshot,
      history: [receipt],
      targets: {
        ...snapshot.targets,
        admin: {
          revision: 5,
          current: receipt.assignment,
          previous: assignment,
        },
      },
    };
    api.apply = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("lost response"))
      .mockResolvedValueOnce({ receipt, replayed: true });
    const { result } = renderHook(() => useExtensionManager(props, api));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.prepare();
    });
    await act(async () => {
      await result.current.apply();
    });
    expect(result.current.pending?.kind).toBe("apply");
    vi.mocked(api.snapshot).mockResolvedValue(applied);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.invalidPlanReason).not.toBeNull();
    await act(async () => {
      await result.current.retry();
    });
    expect(vi.mocked(api.apply).mock.calls[1]).toEqual(
      vi.mocked(api.apply).mock.calls[0],
    );
    expect(vi.mocked(api.apply).mock.calls[1][0]).toEqual({
      planId,
      expectedPlanHash: plan.planHash,
    });
    expect(result.current.pending).toBeNull();
    expect(result.current.receipt?.appliedRevision).toBe(5);
    expect(result.current.snapshot?.targets.admin.revision).toBe(5);
    expect(result.current.plan).toBeNull();
  });

  it("подтверждённый отказ освобождает frozen operation и даёт новому запросу новый UUID", async () => {
    const api = transport();
    api.prepare = vi
      .fn()
      .mockRejectedValueOnce(
        new ExtensionManagerClientError(
          "Назначение изменено другим участником.",
          "REVISION_CONFLICT",
          409,
          "rejected",
        ),
      )
      .mockResolvedValueOnce({ plan, replayed: false });
    const { result } = renderHook(() => useExtensionCommand(api));
    await act(async () => {
      await result.current.start({ kind: "prepare", input: commandInput });
    });
    expect(result.current.pending).toBeNull();
    await act(async () => {
      await result.current.start({ kind: "prepare", input: commandInput });
    });
    const calls = vi.mocked(api.prepare).mock.calls;
    expect(calls[1][1]).not.toBe(calls[0][1]);
  });

  it("transport mutation input не может переписать serialized payload последующего retry", async () => {
    const api = transport();
    const seen: number[] = [];
    api.prepare = vi
      .fn()
      .mockImplementation(async (input: PrepareExtensionAppearanceInput) => {
        if (input.action === "assign") {
          seen.push(input.settings.width as number);
          input.settings.width = 399;
        }
        if (seen.length === 1) throw new TypeError("lost response");
        return { plan, replayed: true };
      });
    const { result } = renderHook(() => useExtensionCommand(api));
    await act(async () => {
      await result.current.start({ kind: "prepare", input: commandInput });
    });
    await act(async () => {
      await result.current.retry();
    });
    expect(seen).toEqual([350, 350]);
    expect(
      commandInput.action === "assign" && commandInput.settings.width,
    ).toBe(350);
  });

  it("malformed success и 5xx остаются uncertain, а wire retry сохраняет body/header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { receipt: { planId }, replayed: false },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "STORAGE_UNAVAILABLE",
              message: "Временно недоступно.",
            },
          }),
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, data: { receipt, replayed: true } }),
          { status: 200 },
        ),
      );
    const api = new ExtensionManagerApi(fetchMock);
    const { result } = renderHook(() => useExtensionCommand(api));
    await act(async () => {
      await result.current.start({
        kind: "apply",
        input: { planId, expectedPlanHash: plan.planHash },
      });
    });
    expect(result.current.pending?.state).toBe("uncertain");
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.pending?.state).toBe("uncertain");
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.pending).toBeNull();
    const wire = fetchMock.mock.calls.map((call) => ({
      url: call[0],
      body: call[1].body,
      key: call[1].headers["Idempotency-Key"],
    }));
    expect(wire[1]).toEqual(wire[0]);
    expect(wire[2]).toEqual(wire[0]);
    expect(wire[0].url).toBe("/api/realize-extensions/appearance/apply");
  });
});

const shellSnapshot: AdminShellSnapshotDto = {
  policy: {
    enabled: { native: true, template: true },
    defaultMode: "template",
    fallbackMode: "native",
    nativeVersion: "3.88.0",
    nativeRoute: "/admin",
    templateRoute: "/system",
  },
  policyHash: "d".repeat(64),
  state: { revision: 3, current: "template", previous: "native" },
  storage: "ready",
  history: [],
  permissions: { manageShell: true },
};
const shellPlan: AdminShellPlanDto = {
  planId: "77f20c12-45da-4410-9fcb-c53c92578c07",
  planHash: "e".repeat(64),
  action: "select",
  currentMode: "template",
  desiredMode: "native",
  expectedRevision: 3,
  policyHash: shellSnapshot.policyHash,
  templateBinding: null,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 300000).toISOString(),
};
const shellReceipt: AdminShellReceiptDto = {
  planId: shellPlan.planId,
  appliedRevision: 4,
  mode: "native",
  appliedAt: new Date().toISOString(),
};
function shellTransport(): AdminShellTransport {
  return {
    snapshot: vi.fn().mockResolvedValue(shellSnapshot),
    prepare: vi.fn().mockResolvedValue({ plan: shellPlan, replayed: false }),
    apply: vi
      .fn()
      .mockResolvedValue({ receipt: shellReceipt, replayed: false }),
  };
}

describe("Extension manager: независимый выбор оболочки", () => {
  it("блокирует пересекающиеся команды до rerender, повторяет тот же UUID и сохраняет appearance draft", async () => {
    const appearanceApi = transport();
    const shellApi = shellTransport();
    shellApi.prepare = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("lost shell response"))
      .mockResolvedValueOnce({ plan: shellPlan, replayed: true });
    const { result, rerender } = renderHook(
      (context) => {
        const lock = useExtensionMutationLock();
        const appearance = useExtensionManager(context, appearanceApi, lock);
        const shell = useAdminShellManager(appearance.snapshot, lock, shellApi);
        return { appearance, shell };
      },
      { initialProps: props },
    );
    await waitFor(() =>
      expect(
        result.current.appearance.loading || result.current.shell.loading,
      ).toBe(false),
    );
    act(() => {
      result.current.appearance.setSettings(
        '{"width":350,"spacing":"compact"}',
      );
      result.current.shell.select("native");
    });
    await act(async () => {
      await Promise.all([
        result.current.shell.prepare(),
        result.current.appearance.prepare(),
      ]);
    });
    expect(appearanceApi.prepare).not.toHaveBeenCalled();
    expect(result.current.shell.pending?.state).toBe("uncertain");
    expect(result.current.appearance.locked).toBe(true);
    const pending = result.current.shell.pending;
    act(() => result.current.appearance.setSettings('{"width":220}'));
    rerender({ ...props, initialTheme: "dark" });
    expect(result.current.appearance.draft?.settingsText).toBe(
      '{"width":350,"spacing":"compact"}',
    );
    expect(result.current.shell.draft).toBe("native");
    await act(async () => {
      await result.current.shell.retry();
    });
    expect(vi.mocked(shellApi.prepare).mock.calls[1]).toEqual(
      vi.mocked(shellApi.prepare).mock.calls[0],
    );
    expect(vi.mocked(shellApi.prepare).mock.calls[1][1]).toBe(
      pending?.requestId,
    );
    expect(result.current.appearance.locked).toBe(false);
    await act(async () => {
      await result.current.shell.apply();
    });
    expect(result.current.shell.receipt?.mode).toBe("native");
    expect(result.current.appearance.draft?.settingsText).toBe(
      '{"width":350,"spacing":"compact"}',
    );
    expect(appearanceApi.apply).not.toHaveBeenCalled();
  });

  it("после lost apply и refresh новой ревизии подтверждает прежнюю операцию, не создавая другую", async () => {
    const api = shellTransport();
    api.apply = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("lost apply"))
      .mockResolvedValueOnce({ receipt: shellReceipt, replayed: true });
    const { result } = renderHook(() =>
      useAdminShellManager(snapshot, undefined, api),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.select("native"));
    await act(async () => {
      await result.current.prepare();
      await result.current.apply();
    });
    // Применение читает подготовленный план после следующего render.
    await act(async () => {
      await result.current.apply();
    });
    expect(result.current.pending?.state).toBe("uncertain");
    const frozen = result.current.pending;
    api.snapshot = vi.fn().mockResolvedValue({
      ...shellSnapshot,
      state: { revision: 4, current: "native", previous: "template" },
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.snapshot?.state.revision).toBe(4);
    expect(result.current.pending?.requestId).toBe(frozen?.requestId);
    await act(async () => {
      await result.current.retry();
    });
    expect(vi.mocked(api.apply).mock.calls[1]).toEqual(
      vi.mocked(api.apply).mock.calls[0],
    );
    expect(result.current.receipt).toEqual(shellReceipt);
    expect(result.current.plan).toBeNull();
    expect(api.prepare).toHaveBeenCalledTimes(1);
  });

  it("восстановление имеет собственную ревизию и инвалидирует template plan после смены оформления", async () => {
    const api = shellTransport();
    const candidate: AdminShellPlanDto = {
      ...shellPlan,
      action: "recover",
      currentMode: "native",
      desiredMode: "template",
      templateBinding: {
        appearanceRevision: 4,
        appearanceHash: "f".repeat(64),
        catalogHash: snapshot.catalog.catalogHash,
        assignment,
      },
    };
    api.snapshot = vi.fn().mockResolvedValue({
      ...shellSnapshot,
      state: { revision: 3, current: "native", previous: "template" },
    });
    api.prepare = vi
      .fn()
      .mockResolvedValue({ plan: candidate, replayed: false });
    const { result, rerender } = renderHook(
      (appearance) => useAdminShellManager(appearance, undefined, api),
      { initialProps: snapshot },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.recover();
    });
    expect(vi.mocked(api.prepare).mock.calls[0][0]).toEqual({
      action: "recover",
      expectedRevision: 3,
      expectedPolicyHash: shellSnapshot.policyHash,
    });
    expect(result.current.invalidPlanReason).toBeNull();
    rerender({
      ...snapshot,
      targets: {
        ...snapshot.targets,
        admin: { ...snapshot.targets.admin, revision: 5 },
      },
    });
    expect(result.current.invalidPlanReason).toContain(
      "Оформление Admin изменилось",
    );
    await act(async () => {
      await result.current.apply();
    });
    expect(api.apply).not.toHaveBeenCalled();
  });

  it("отказ освобождает общий lock, а policy запрещает выбор отключённой оболочки", async () => {
    const api = shellTransport();
    api.prepare = vi
      .fn()
      .mockRejectedValue(
        new ExtensionManagerClientError(
          "Назначение изменилось",
          "REVISION_CONFLICT",
          409,
          "rejected",
        ),
      );
    const { result } = renderHook(() => {
      const lock = useExtensionMutationLock();
      const shell = useAdminShellManager(snapshot, lock, api);
      const appearance = useExtensionManager(props, transport(), lock);
      return { shell, appearance };
    });
    await waitFor(() =>
      expect(
        result.current.shell.loading || result.current.appearance.loading,
      ).toBe(false),
    );
    await act(async () => {
      await result.current.shell.prepare();
    });
    expect(result.current.shell.pending).toBeNull();
    expect(result.current.appearance.locked).toBe(false);
    api.snapshot = vi.fn().mockResolvedValue({
      ...shellSnapshot,
      policy: {
        ...shellSnapshot.policy,
        enabled: { native: false, template: true },
        fallbackMode: "template",
      },
    });
    await act(async () => {
      await result.current.shell.refresh();
    });
    act(() => result.current.shell.select("native"));
    expect(result.current.shell.draft).toBe("template");
  });

  it("строгий shell adapter сохраняет wire UUID/payload и отклоняет противоречивый native preview", async () => {
    const malformed = {
      ...shellPlan,
      templateBinding: {
        appearanceRevision: 4,
        appearanceHash: "f".repeat(64),
        catalogHash: snapshot.catalog.catalogHash,
        assignment,
      },
    };
    const requestFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { plan: malformed, replayed: false },
        }),
        { status: 200 },
      ),
    );
    const api = new AdminShellApi(requestFetch);
    const input = {
      action: "select" as const,
      mode: "native" as const,
      expectedRevision: 3,
      expectedPolicyHash: shellSnapshot.policyHash,
    };
    const requestId = "0e8a66f8-3c42-4c2c-bf90-738d6889cb11";
    await expect(api.prepare(input, requestId)).rejects.toMatchObject({
      certainty: "unknown",
      code: "INVALID_RESPONSE",
    });
    expect(requestFetch.mock.calls[0][0]).toBe(
      "/api/realize-extensions/admin-shell/plans",
    );
    expect(requestFetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: { "Idempotency-Key": requestId },
      body: JSON.stringify(input),
    });
  });
});

const installedSnapshot: InstalledTemplatesSnapshotDto = {
  schemaVersion: "1.0",
  runtime: {
    status: "verified",
    buildId: "fixture-build",
    sourceVersion: "fixture-source",
    builtAt: "2026-10-12T10:00:00.000Z",
  },
  entries: [
    {
      kind: "builtin",
      key: "builtin:payload-native@3.88.0",
      id: "payload-native",
      name: "Стандартная Payload",
      version: "3.88.0",
      packageName: null,
      targets: ["admin"],
      installation: "confirmed",
      availability: "available",
      usage: { selectedTargets: [], activeTargets: [], defaultTargets: [] },
      palettes: [],
      actions: { settings: false, select: true, reason: null },
    },
    {
      kind: "package",
      key: "package:fixture@1.0.0",
      id: "fixture",
      name: "Тестовый шаблон",
      version: "1.0.0",
      packageName: "@fixture/template",
      targets: ["admin"],
      installation: "confirmed",
      availability: "available",
      usage: {
        selectedTargets: ["admin"],
        activeTargets: ["admin"],
        defaultTargets: ["admin"],
      },
      palettes: [
        {
          id: "base",
          version: "1.0.0",
          label: "Базовая",
          modes: ["light", "dark"],
        },
      ],
      actions: { settings: true, select: true, reason: null },
    },
  ],
  unavailableAssignments: [],
  storage: "ready",
  permissions: { manageAppearance: true },
  observedAt: "2026-10-12T10:01:00.000Z",
};

describe("Extension manager: installed inventory и защита черновика", () => {
  it("открывает настройки той же версии без сброса draft или подготовленного плана", async () => {
    const api = transport();
    const { result } = renderHook(() => useExtensionManager(props, api));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setSettings('{"width":350,"spacing":"compact"}'));
    await act(async () => {
      await result.current.prepare();
    });
    const prepared = result.current.plan;
    act(() =>
      expect(result.current.selectTemplate("fixture@1.0.0")).toBe(true),
    );
    expect(result.current.draft?.settingsText).toBe(
      '{"width":350,"spacing":"compact"}',
    );
    expect(result.current.plan).toBe(prepared);
    expect(result.current.templateChange).toBeNull();
  });

  it("требует явного решения при смене версии с dirty draft, а отмена сохраняет настройки", async () => {
    const api = transport();
    const second = {
      ...snapshot.catalog.entries[0],
      manifest: { ...snapshot.catalog.entries[0].manifest, version: "2.0.0" },
    };
    api.snapshot = vi
      .fn()
      .mockResolvedValue({
        ...snapshot,
        catalog: {
          ...snapshot.catalog,
          entries: [...snapshot.catalog.entries, second],
        },
      });
    const { result } = renderHook(() => useExtensionManager(props, api));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setSettings('{"width":350,"spacing":"compact"}'));
    act(() =>
      expect(result.current.selectTemplate("fixture@2.0.0")).toBe(false),
    );
    expect(result.current.templateChange?.key).toBe("fixture@2.0.0");
    expect(result.current.draft?.selection.templateVersion).toBe("1.0.0");
    act(() => result.current.cancelTemplateChange());
    expect(result.current.draft?.settingsText).toBe(
      '{"width":350,"spacing":"compact"}',
    );
    act(() => result.current.selectTemplate("fixture@2.0.0"));
    act(() => expect(result.current.confirmTemplateChange()).toBe(true));
    expect(result.current.draft?.selection.templateVersion).toBe("2.0.0");
    expect(JSON.parse(result.current.draft!.settingsText)).toEqual(
      assignment.settings,
    );
    expect(result.current.templateChange).toBeNull();
  });

  it("Native selection и повторное открытие settings сохраняют draft, frozen lock блокирует все действия карточек", async () => {
    const appearanceApi = transport();
    const shellApi = shellTransport();
    shellApi.prepare = vi
      .fn()
      .mockRejectedValue(new TypeError("lost response"));
    const { result } = renderHook(() => {
      const lock = useExtensionMutationLock();
      const appearance = useExtensionManager(props, appearanceApi, lock);
      const shell = useAdminShellManager(appearance.snapshot, lock, shellApi);
      return { appearance, shell };
    });
    await waitFor(() =>
      expect(
        result.current.appearance.loading || result.current.shell.loading,
      ).toBe(false),
    );
    act(() =>
      result.current.appearance.setSettings(
        '{"width":350,"spacing":"compact"}',
      ),
    );
    const onSelect = vi.fn((entry) => {
      if (entry.kind === "builtin") result.current.shell.select("native");
      else
        result.current.appearance.selectTemplate(
          `${entry.id}@${entry.version}`,
        );
    });
    const onSettings = vi.fn((entry) =>
      result.current.appearance.selectTemplate(`${entry.id}@${entry.version}`),
    );
    const widgetProps: InstalledTemplatesProps = {
      snapshot: installedSnapshot,
      target: "admin",
      loading: false,
      error: null,
      locked: false,
      onRefresh: vi.fn(),
      onSelect,
      onSettings,
    };
    const widget = render(createElement(InstalledTemplates, widgetProps));
    fireEvent.click(
      screen.getByRole("button", { name: "Выбрать оболочку" }),
    );
    expect(result.current.shell.draft).toBe("native");
    fireEvent.click(
      screen.getByRole("button", { name: "Настройки и палитра" }),
    );
    expect(result.current.appearance.draft?.settingsText).toBe(
      '{"width":350,"spacing":"compact"}',
    );
    await act(async () => {
      await result.current.shell.prepare();
    });
    const pending = result.current.shell.pending;
    widget.rerender(
      createElement(InstalledTemplates, {
        ...widgetProps,
        locked: result.current.appearance.locked || result.current.shell.locked,
      }),
    );
    for (const name of [
      "Выбрать оболочку",
      "Выбрать шаблон",
      "Настройки и палитра",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveProperty("disabled", true);
      fireEvent.click(button);
    }
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(result.current.shell.pending?.requestId).toBe(pending?.requestId);
    expect(result.current.appearance.draft?.settingsText).toBe(
      '{"width":350,"spacing":"compact"}',
    );
  });

  it("не заменяет dirty draft через ожидающее подтверждение пока операция имеет unknown outcome", async () => {
    const api = transport();
    api.prepare = vi.fn().mockRejectedValue(new TypeError("lost response"));
    const second = {
      ...snapshot.catalog.entries[0],
      manifest: { ...snapshot.catalog.entries[0].manifest, version: "2.0.0" },
    };
    api.snapshot = vi
      .fn()
      .mockResolvedValue({
        ...snapshot,
        catalog: {
          ...snapshot.catalog,
          entries: [...snapshot.catalog.entries, second],
        },
      });
    const { result } = renderHook(() => useExtensionManager(props, api));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setSettings('{"width":350,"spacing":"compact"}'));
    act(() => result.current.selectTemplate("fixture@2.0.0"));
    await act(async () => {
      await result.current.prepare();
    });
    const frozen = result.current.pending;
    act(() => expect(result.current.confirmTemplateChange()).toBe(false));
    expect(result.current.draft?.selection.templateVersion).toBe("1.0.0");
    expect(result.current.draft?.settingsText).toBe(
      '{"width":350,"spacing":"compact"}',
    );
    expect(result.current.pending).toEqual(frozen);
  });

  it("поздний ответ GET inventory не перезаписывает результат более нового refresh", async () => {
    const old = deferred<InstalledTemplatesSnapshotDto>();
    const latest = {
      ...installedSnapshot,
      observedAt: "2026-10-12T10:02:00.000Z",
    };
    const api = {
      snapshot: vi
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(latest),
    };
    const { result, unmount } = renderHook(() => useInstalledTemplates(api));
    await waitFor(() => expect(api.snapshot).toHaveBeenCalledTimes(1));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.snapshot).toEqual(latest);
    await act(async () => {
      old.resolve(installedSnapshot);
      await old.promise;
    });
    expect(result.current.snapshot).toEqual(latest);
    unmount();
  });

  it("строгий inventory adapter не принимает Native как фиктивный package и не объявляет source installation подтверждённой", async () => {
    const invalid = {
      ...installedSnapshot,
      entries: [
        {
          ...installedSnapshot.entries[0],
          packageName: "@fake/native",
          palettes: [
            { id: "fake", version: "1.0.0", label: "Fake", modes: ["light"] },
          ],
        },
      ],
    };
    const requestFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: invalid }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              ...installedSnapshot,
              runtime: {
                status: "unverified",
                buildId: null,
                sourceVersion: null,
                builtAt: null,
              },
            },
          }),
          { status: 200 },
        ),
      );
    const api = new InstalledTemplatesApi(requestFetch);
    await expect(api.snapshot()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    await expect(api.snapshot()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    expect(requestFetch.mock.calls[0][0]).toBe(
      "/api/realize-extensions/installed-templates",
    );
  });
});
