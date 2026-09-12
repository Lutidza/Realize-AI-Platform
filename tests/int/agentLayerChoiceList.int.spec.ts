/**
 * @file tests/int/agentLayerChoiceList.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет общий выбор системных целей и связей без потери сохранённых ограничений.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_AI_CONFIG_PROJECTION } from "@realize/change-engine";
import type { AIConfigArtifact } from "@realize/ai-contracts";
import type { AgentLayerBindingInput } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerBinding.types";
import { useAgentLayerChoiceList } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerChoiceList.hook";
import { AgentLayerChoiceList } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerChoiceList.component";
import { useAgentLayerReferencePicker } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerReferencePicker.hook";
import { AgentLayerCapabilityFields } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerCapabilityFields.component";
import { AgentLayerCapabilityScopes } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerCapabilityScopes.component";
import { AgentLayerCheckFields } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerCheckFields.component";

afterEach(cleanup);

const options = Array.from({ length: 60 }, (_, index) => ({
  key: `item.${index}`,
  title: `Запись ${index}`,
}));

describe("agent layer shared choice list", () => {
  it("bounds read-only registry metadata without offering selection controls", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useAgentLayerChoiceList({
        options,
        selectedKeys: [],
        mode: "readOnly",
        disabled: false,
        onChange,
      }),
    );
    expect(result.current.rows).toHaveLength(25);
    act(() => result.current.toggle("item.0"));
    expect(onChange).not.toHaveBeenCalled();
    render(
      createElement(AgentLayerChoiceList, {
        label: "Обязательные проверки",
        picker: result.current,
      }),
    );
    expect(
      screen.queryByRole("button", { name: /Выбрать|Выбранные|Все/ }),
    ).toBeNull();
    expect(
      screen.getByRole("searchbox", {
        name: "Поиск связей: Обязательные проверки",
      }),
    ).toBeTruthy();
  });
  it("bounds pages and preserves hidden selections across search and selected-only filters", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useAgentLayerChoiceList({
        options,
        selectedKeys: ["item.59"],
        disabled: false,
        onChange,
      }),
    );
    expect(result.current.rows).toHaveLength(25);
    act(() => result.current.setPage(3));
    expect(result.current.rows).toHaveLength(10);
    act(() => result.current.setQuery("Запись 11"));
    expect(result.current.page).toBe(1);
    expect(result.current.rows.map((item) => item.key)).toEqual(["item.11"]);
    expect(result.current.selectedCount).toBe(1);
    act(() => result.current.setSelectedOnly(true));
    expect(result.current.rows).toEqual([]);
    act(() => result.current.setQuery(""));
    expect(result.current.rows.map((item) => item.key)).toEqual(["item.59"]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("retains missing keys and removes them only through an explicit selection action", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useAgentLayerChoiceList({
        options,
        selectedKeys: ["legacy.scope", "item.3"],
        disabled: false,
        onChange,
      }),
    );
    expect(result.current.rows[0]).toMatchObject({
      key: "legacy.scope",
      missing: true,
      selected: true,
    });
    expect(result.current.missingCount).toBe(1);
    act(() => result.current.toggle("unregistered.scope"));
    expect(onChange).not.toHaveBeenCalled();
    act(() => result.current.toggle("legacy.scope"));
    expect(onChange).toHaveBeenCalledWith(["item.3"]);
  });

  it("blocks new values at the configured limit but permits removal", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useAgentLayerChoiceList({
        options,
        selectedKeys: ["item.0", "item.1"],
        limit: 2,
        disabled: false,
        onChange,
      }),
    );
    act(() => result.current.toggle("item.2"));
    expect(onChange).not.toHaveBeenCalled();
    act(() => result.current.toggle("item.1"));
    expect(onChange).toHaveBeenCalledWith(["item.0"]);
  });

  it("replaces a single missing system target without allowing arbitrary or empty targets", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useAgentLayerChoiceList({
        options,
        selectedKeys: ["legacy.target"],
        mode: "single",
        disabled: false,
        onChange,
      }),
    );
    act(() => result.current.toggle("legacy.target"));
    act(() => result.current.toggle("other.unknown"));
    expect(onChange).not.toHaveBeenCalled();
    act(() => result.current.toggle("item.2"));
    expect(onChange).toHaveBeenCalledWith(["item.2"]);
  });

  it("keeps a removed option visible when registry data changes and prevents locked mutations", () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ available, disabled }) =>
        useAgentLayerChoiceList({
          options: available,
          selectedKeys: ["item.0"],
          disabled,
          onChange,
        }),
      { initialProps: { available: options, disabled: false } },
    );
    rerender({ available: options.slice(1), disabled: true });
    expect(result.current.rows[0]).toMatchObject({
      key: "item.0",
      missing: true,
    });
    act(() => result.current.toggle("item.0"));
    act(() => result.current.toggle("item.1"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("adapts only exact artifact kinds and retains disabled-reference warnings and navigation", () => {
    const artifacts: AIConfigArtifact[] = [
      {
        kind: "check_binding",
        key: "shared",
        title: "Проверка",
        enabled: false,
        revision: 1,
        checkID: "payload.access",
      },
      {
        kind: "local_role",
        key: "shared",
        title: "Роль",
        enabled: true,
        revision: 1,
        instructions: "Работать",
        capabilityBindingKeys: [],
      },
    ];
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useAgentLayerReferencePicker({
        artifacts,
        kind: "check_binding",
        selectedKeys: ["shared", "missing"],
        sourceEnabled: true,
        disabled: false,
        onChange,
      }),
    );
    expect(result.current.totalCount).toBe(2);
    expect(result.current.problemCount).toBe(2);
    expect(result.current.disabledCount).toBe(1);
    expect(
      result.current.rows.find((item) => item.key === "shared"),
    ).toMatchObject({ title: "Проверка", inactive: true, canOpen: true });
    act(() => result.current.toggle("missing"));
    expect(onChange).toHaveBeenCalledWith(["shared"]);
  });
});

describe("agent layer binding fields", () => {
  const descriptor = SYSTEM_AI_CONFIG_PROJECTION.capabilities[0]!;
  const fields: Extract<
    AgentLayerBindingInput,
    { kind: "capability_binding" }
  > = {
    kind: "capability_binding",
    key: "binding",
    title: "Возможность",
    enabled: true,
    capability: { id: "legacy.capability", version: "0.5" },
    allowedActions: ["legacy.action"],
    maxTargets: "12",
    readScopes: ["legacy.read"],
    writeScopes: [],
  };

  it("selects an exact version without resetting existing actions, scopes or limits", () => {
    const onChange = vi.fn();
    render(
      createElement(AgentLayerCapabilityFields, {
        id: "capability",
        fields,
        system: SYSTEM_AI_CONFIG_PROJECTION,
        disabled: false,
        onChange,
      }),
    );
    expect(screen.getByText("Системная версия не найдена")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: `Выбрать «${descriptor.title} · ${descriptor.version}»`,
      }),
    );
    expect(onChange).toHaveBeenCalledWith({
      ...fields,
      capability: { id: descriptor.id, version: descriptor.version },
    });
  });

  it("distinguishes an inherited scope from an explicitly empty scope", () => {
    const onChange = vi.fn();
    const props = {
      id: "read",
      label: "Области чтения",
      systemScopes: descriptor.scopes.read,
      hasDescriptor: true,
      disabled: false,
      onChange,
    };
    const view = render(
      createElement(AgentLayerCapabilityScopes, { ...props, value: undefined }),
    );
    const toggle = screen.getByRole("switch", {
      name: "Области чтения: наследовать из системной основы",
      hidden: true,
    });
    expect((toggle as HTMLInputElement).checked).toBe(true);
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith([]);
    view.rerender(
      createElement(AgentLayerCapabilityScopes, { ...props, value: [] }),
    );
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("retains raw limit input and warns about unavailable project profiles", () => {
    const onChange = vi.fn();
    const registered = {
      ...fields,
      capability: { id: descriptor.id, version: descriptor.version },
    };
    render(
      createElement(AgentLayerCapabilityFields, {
        id: "capability",
        fields: registered,
        system: {
          ...SYSTEM_AI_CONFIG_PROJECTION,
          projectProfile: "different-profile",
        },
        disabled: false,
        onChange,
      }),
    );
    expect(
      screen.getByText("Возможность недоступна профилю проекта"),
    ).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Максимум объектов" }),
      { target: { value: "1.5" } },
    );
    expect(onChange).toHaveBeenLastCalledWith({
      ...registered,
      maxTargets: "1.5",
    });
  });

  it("keeps an orphan check visible and repairs it with a registered check ID", () => {
    const onChange = vi.fn();
    const check: Extract<AgentLayerBindingInput, { kind: "check_binding" }> = {
      kind: "check_binding",
      key: "check",
      title: "Проверка",
      enabled: false,
      checkID: "legacy.check",
    };
    render(
      createElement(AgentLayerCheckFields, {
        id: "check",
        fields: check,
        system: SYSTEM_AI_CONFIG_PROJECTION,
        disabled: false,
        onChange,
      }),
    );
    expect(screen.getByText("Системная проверка не найдена")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Выбрать «payload.access»" }),
    );
    expect(onChange).toHaveBeenCalledWith({
      ...check,
      checkID: "payload.access",
    });
  });
});
