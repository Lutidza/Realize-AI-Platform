/**
 * @file tests/int/useAgentLayerConfiguration.int.spec.ts
 * @version 1.5.0
 * @date 2026-09-10
 * @description Проверяет CAS, сохранение формы данных и повтор exact request после неизвестного результата.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AIAgentProfileDefinition,
  AIConfigArtifact,
  AIConfigDraftDTO,
  AIConfigDraftSummaryDTO,
  AIConfigValidationDTO,
} from "@realize/ai-contracts";
import { useAgentLayerConfiguration } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerConfiguration.hook";
import { useAgentLayerWorkspace } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerWorkspace.hook";
import { useAgentLayerEditor } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerEditor.hook";
import { AI_CONFIG_ARTIFACTS } from "./fixtures/aiConfiguration";
import type { AgentLayerInstructionKind } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerInstruction.types";
import { isAgentLayerInstructionArtifact } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/isAgentLayerInstructionArtifact.util";
import { getAgentLayerInstructionFields } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerInstructionFields.util";
import type { AgentLayerBindingKind } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerBinding.types";
import { isAgentLayerBindingArtifact } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/isAgentLayerBindingArtifact.util";
import { getAgentLayerBindingFields } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerBindingFields.util";
import type { AgentLayerWorkflowInput } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflow.types";
import { getAgentLayerWorkflowFields } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerWorkflowFields.util";
import {
  agentLayerBootstrap,
  agentLayerDraft,
  agentLayerRule,
} from "./fixtures/agentLayerConfiguration";

let stored: AIConfigDraftDTO;
let loseMutationReply: boolean;
let failDetailAfterWrite: boolean;
let changeRuleBeforeReadback: boolean;
let writes: number;
const requests: Array<{ body: string; key: string }> = [];
const receipts = new Map<
  string,
  AIConfigDraftSummaryDTO | AIConfigValidationDTO
>();
const envelope = (data: unknown) =>
  Response.json({ ok: true, data, correlationID: "fixture" });

beforeEach(() => {
  stored = structuredClone(agentLayerDraft);
  loseMutationReply = false;
  failDetailAfterWrite = false;
  changeRuleBeforeReadback = false;
  writes = 0;
  requests.length = 0;
  receipts.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config"))
        return envelope({ ...agentLayerBootstrap, drafts: [stored] });
      if (init?.method === "POST") {
        const body = String(init.body);
        const key = new Headers(init.headers).get("Idempotency-Key")!;
        requests.push({ body, key });
        const existing = receipts.get(key);
        if (existing) return envelope(existing);
        const input = JSON.parse(body);
        writes++;
        let receipt: AIConfigDraftSummaryDTO | AIConfigValidationDTO;
        if (url.endsWith("/config/drafts")) {
          stored = {
            ...stored,
            id: input.draftID,
            artifacts: input.artifacts,
            artifactCount: input.artifacts.length,
            revision: 1,
            state: "editing",
          };
          const { artifacts: _artifacts, ...summary } = stored;
          receipt = summary;
        } else if (url.endsWith("/config/validate")) {
          stored = { ...stored, revision: stored.revision + 1, state: "ready" };
          receipt = {
            checkedRevision: input.expectedRevision,
            draftID: input.draftID,
            issues: [],
            resultingRevision: stored.revision,
            state: "ready",
            systemManifestHash: agentLayerBootstrap.system.manifestHash,
            valid: true,
          };
        } else throw new Error(`Unexpected fixture mutation: ${url}`);
        receipts.set(key, receipt);
        if (loseMutationReply) {
          loseMutationReply = false;
          throw new TypeError("Connection lost after commit");
        }
        return envelope(receipt);
      }
      if (init?.method === "PUT") {
        const body = String(init.body);
        const key = new Headers(init.headers).get("Idempotency-Key")!;
        requests.push({ body, key });
        const existing = receipts.get(key);
        if (existing) return envelope(existing);
        const input = JSON.parse(body);
        if (input.expectedRevision !== stored.revision)
          return Response.json(
            {
              ok: false,
              error: { code: "CONFLICT", message: "Server conflict" },
              correlationID: "fixture",
            },
            { status: 409 },
          );
        writes++;
        stored = {
          ...stored,
          artifacts: input.artifacts,
          baseRelease: input.baseRelease,
          revision: stored.revision + 1,
          state: "editing",
        };
        const { artifacts: _artifacts, ...summary } = stored;
        receipts.set(key, summary);
        if (loseMutationReply) {
          loseMutationReply = false;
          throw new TypeError("Connection lost after commit");
        }
        return envelope(summary);
      }
      if (url.includes("/config/drafts/")) {
        if (failDetailAfterWrite && writes) {
          failDetailAfterWrite = false;
          throw new TypeError("Detail unavailable");
        }
        if (changeRuleBeforeReadback && writes) {
          changeRuleBeforeReadback = false;
          stored = {
            ...stored,
            revision: stored.revision + 1,
            artifacts: stored.artifacts.map((artifact) =>
              artifact.kind === "local_rule" &&
              artifact.key === agentLayerRule.key
                ? {
                    ...artifact,
                    revision: artifact.revision + 1,
                    instruction: "Правка другого редактора.",
                  }
                : artifact,
            ),
          };
        }
        return envelope(stored);
      }
      throw new Error(`Unexpected fixture request: ${url}`);
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
    const workspace = useAgentLayerWorkspace({ configuration, editor });
    return { configuration, editor, workspace };
  });

describe.each<AgentLayerInstructionKind>([
  "local_role",
  "skill",
  "prompt_template",
])("%s editor lifecycle", (kind) => {
  const fixtures: readonly AIConfigArtifact[] = AI_CONFIG_ARTIFACTS;
  const source = fixtures
    .filter(isAgentLayerInstructionArtifact)
    .find((item) => item.kind === kind)!;
  beforeEach(() => {
    stored = { ...stored, artifacts: [...stored.artifacts, source] };
  });

  it("creates and copies locally, preserving selection identity, source and neighboring artifacts", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    const neighbors = structuredClone(stored.artifacts);
    act(() => result.current.workspace.selectSection(kind));
    act(() => result.current.workspace.newInstruction(kind));
    const identity = result.current.workspace.recordIdentity;
    expect(result.current.editor.instructionForm?.fields.kind).toBe(kind);
    expect(result.current.editor.isDirty).toBe(true);
    expect(writes).toBe(0);
    act(() =>
      result.current.editor.updateInstruction({
        ...getAgentLayerInstructionFields(source),
        key: `${source.key}.new`,
      }),
    );
    await act(async () => {
      await result.current.editor.save();
    });
    expect(writes).toBe(1);
    expect(result.current.editor.isDirty).toBe(false);
    expect(result.current.workspace.recordIdentity).toBe(identity);
    expect(result.current.workspace.selectedArtifact).toMatchObject({
      kind,
      key: `${source.key}.new`,
      revision: 1,
    });
    expect(stored.artifacts.slice(0, neighbors.length)).toEqual(neighbors);
    act(() => result.current.workspace.copyInstruction());
    expect(writes).toBe(1);
    expect(result.current.workspace.recordIdentity).not.toBe(identity);
    expect(result.current.editor.instructionForm?.originalKey).toBeUndefined();
    expect(result.current.editor.instructionForm?.fields.key).toBe(
      `${source.key}.new.copy`,
    );
    failDetailAfterWrite = true;
    await act(async () => {
      await result.current.editor.save();
    });
    expect(result.current.editor.instructionNotice).toContain("Копия");
    expect(result.current.configuration.hasPendingMutation).toBe(true);
    await act(async () => {
      await result.current.editor.retry();
    });
    expect(result.current.editor.instructionNotice).toBeUndefined();
    expect(writes).toBe(2);
    expect(result.current.editor.isDirty).toBe(false);
    expect(stored.artifacts.slice(0, neighbors.length)).toEqual(neighbors);
    expect(result.current.workspace.selectedArtifact).toMatchObject({
      kind,
      key: `${source.key}.new.copy`,
      revision: 1,
    });
  });

  it.each(["reply", "detail"])(
    "keeps edited content and exact request until lost %s is confirmed",
    async (failure) => {
      const { result } = renderWorkspace();
      await waitFor(() =>
        expect(result.current.configuration.isLoading).toBe(false),
      );
      act(() => result.current.workspace.openArtifact(source));
      act(() =>
        result.current.editor.updateInstruction({
          ...result.current.editor.instructionForm!.fields,
          key: "ignored.rename",
          title: "Обновлённая инструкция",
          enabled: false,
        }),
      );
      expect(result.current.editor.instructionForm?.fields.key).toBe(
        source.key,
      );
      loseMutationReply = failure === "reply";
      failDetailAfterWrite = failure === "detail";
      await act(async () => {
        await result.current.editor.save();
      });
      expect(result.current.configuration.hasPendingMutation).toBe(true);
      expect(result.current.editor.isDirty).toBe(true);
      act(() => result.current.workspace.selectSection("overview"));
      expect(result.current.editor.instructionForm?.fields.title).toBe(
        "Обновлённая инструкция",
      );
      await act(async () => {
        await result.current.editor.retry();
      });
      expect(writes).toBe(1);
      expect(result.current.editor.isDirty).toBe(false);
      expect(result.current.editor.instructionForm?.baseline).toMatchObject({
        key: source.key,
        title: "Обновлённая инструкция",
        enabled: false,
      });
      expect(result.current.workspace.selectedArtifact).toMatchObject({
        revision: source.revision + 1,
        enabled: false,
      });
      expect(requests).toHaveLength(failure === "reply" ? 2 : 1);
      if (failure === "reply") expect(requests[0]).toEqual(requests[1]);
    },
  );

  it("preserves dirty input and catalog through cancelled navigation and CAS refresh", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.selectSection(kind));
    const catalog = {
      search: source.key,
      status: "all",
      usage: "all",
      sort: "title",
      page: 1,
    } as const;
    act(() => result.current.workspace.setCatalog(catalog));
    act(() => result.current.workspace.openArtifact(source));
    act(() =>
      result.current.editor.updateInstruction({
        ...result.current.editor.instructionForm!.fields,
        title: "Несохранённый ввод",
      }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => result.current.workspace.openArtifact(agentLayerRule));
    expect(result.current.editor.instructionForm?.fields.title).toBe(
      "Несохранённый ввод",
    );
    act(() => result.current.workspace.copyInstruction());
    expect(result.current.editor.instructionForm?.originalKey).toBe(source.key);
    stored = { ...stored, revision: stored.revision + 1 };
    await act(async () => {
      await result.current.editor.save();
    });
    expect(result.current.configuration.errorKind).toBe("conflict");
    expect(writes).toBe(0);
    await act(async () =>
      expect(await result.current.workspace.refresh()).toBe(false),
    );
    expect(result.current.editor.instructionForm?.fields.title).toBe(
      "Несохранённый ввод",
    );
    confirm.mockReturnValue(true);
    await act(async () =>
      expect(await result.current.workspace.refresh()).toBe(true),
    );
    expect(result.current.editor.instructionForm).toBeNull();
    expect(result.current.workspace.selectedArtifact).toBeUndefined();
    expect(result.current.workspace.catalog).toEqual(catalog);
  });
});

describe.each<AgentLayerBindingKind>(["capability_binding", "check_binding"])(
  "%s: жизненный цикл редактора",
  (kind) => {
    const fixtures: readonly AIConfigArtifact[] = AI_CONFIG_ARTIFACTS;
    const source = fixtures
      .filter(isAgentLayerBindingArtifact)
      .find((item) => item.kind === kind)!;
    beforeEach(() => {
      stored = {
        ...stored,
        artifacts: [...stored.artifacts, structuredClone(source)],
        artifactCount: stored.artifacts.length + 1,
      };
    });

    it("создаёт и копирует локально, сохраняя исходную запись, соседей и идентичность формы", async () => {
      const { result } = renderWorkspace();
      await waitFor(() =>
        expect(result.current.configuration.isLoading).toBe(false),
      );
      const neighbors = structuredClone(stored.artifacts);
      act(() => result.current.workspace.selectSection(kind));
      act(() => result.current.workspace.newBinding(kind));
      const identity = result.current.workspace.recordIdentity;
      expect(result.current.editor.bindingForm?.fields.kind).toBe(kind);
      expect(result.current.editor.isDirty).toBe(true);
      expect(writes).toBe(0);
      act(() =>
        result.current.editor.updateBinding({
          ...getAgentLayerBindingFields(source),
          key: `${source.key}.new`,
        }),
      );
      await act(async () => {
        await result.current.editor.save();
      });
      expect(writes).toBe(1);
      expect(result.current.editor.isDirty).toBe(false);
      expect(result.current.workspace.recordIdentity).toBe(identity);
      expect(result.current.workspace.selectedArtifact).toMatchObject({
        kind,
        key: `${source.key}.new`,
        revision: 1,
      });
      act(() => result.current.workspace.copyBinding());
      expect(writes).toBe(1);
      expect(result.current.workspace.recordIdentity).not.toBe(identity);
      expect(result.current.editor.bindingForm?.originalKey).toBeUndefined();
      expect(result.current.editor.bindingForm?.fields.key).toBe(
        `${source.key}.new.copy`,
      );
      expect(result.current.editor.isDirty).toBe(true);
      await act(async () => {
        await result.current.editor.save();
      });
      expect(writes).toBe(2);
      expect(result.current.editor.isDirty).toBe(false);
      expect(result.current.workspace.selectedArtifact).toMatchObject({
        kind,
        key: `${source.key}.new.copy`,
        revision: 1,
      });
      expect(stored.artifacts.slice(0, neighbors.length)).toEqual(neighbors);
      act(() => result.current.workspace.closeArtifact());
      expect(result.current.workspace.section).toBe(kind);
    });

    it.each(["ответа", "readback"])(
      "после потери %s блокирует изменения и подтверждает исходные поля ровно одной записью",
      async (failure) => {
        const { result } = renderWorkspace();
        await waitFor(() =>
          expect(result.current.configuration.isLoading).toBe(false),
        );
        act(() => result.current.workspace.openArtifact(source));
        const baseline = structuredClone(
          result.current.editor.bindingForm!.baseline,
        );
        act(() =>
          result.current.editor.updateBinding({
            ...result.current.editor.bindingForm!.fields,
            key: "ignored.rename",
            title: "Сохранить это название",
            enabled: false,
          }),
        );
        expect(result.current.editor.bindingForm?.fields.key).toBe(source.key);
        loseMutationReply = failure === "ответа";
        failDetailAfterWrite = failure === "readback";
        await act(async () => {
          await result.current.editor.save();
        });
        expect(result.current.configuration.hasPendingMutation).toBe(true);
        expect(result.current.editor.isDirty).toBe(true);
        expect(result.current.editor.bindingForm?.baseline).toEqual(baseline);
        act(() =>
          result.current.editor.updateBinding({
            ...result.current.editor.bindingForm!.fields,
            title: "Заменить незавершённую запись",
          }),
        );
        act(() => result.current.workspace.selectSection("overview"));
        act(() => result.current.workspace.openArtifact(agentLayerRule));
        act(() => result.current.workspace.newBinding(kind));
        expect(result.current.editor.bindingForm?.fields.title).toBe(
          "Сохранить это название",
        );
        await act(async () => {
          await result.current.editor.retry();
        });
        expect(writes).toBe(1);
        expect(result.current.editor.isDirty).toBe(false);
        expect(result.current.editor.bindingForm?.baseline).toMatchObject({
          key: source.key,
          title: "Сохранить это название",
          enabled: false,
        });
        expect(result.current.workspace.selectedArtifact).toMatchObject({
          revision: source.revision + 1,
          enabled: false,
        });
        expect(requests).toHaveLength(failure === "ответа" ? 2 : 1);
        if (failure === "ответа") expect(requests[0]).toEqual(requests[1]);
        await act(async () => {
          await result.current.editor.save();
        });
        expect(writes).toBe(1);
      },
    );

    it("сохраняет ввод и каталог после отменённых переходов и конфликта CAS до принятого обновления", async () => {
      const { result } = renderWorkspace();
      await waitFor(() =>
        expect(result.current.configuration.isLoading).toBe(false),
      );
      act(() => result.current.workspace.selectSection(kind));
      const catalog = {
        search: source.key,
        status: "all",
        usage: "used",
        sort: "title",
        page: 2,
      } as const;
      act(() => result.current.workspace.setCatalog(catalog));
      act(() => result.current.workspace.openArtifact(source));
      const baseline = structuredClone(
        result.current.editor.bindingForm!.baseline,
      );
      act(() =>
        result.current.editor.updateBinding({
          ...result.current.editor.bindingForm!.fields,
          title: "Несохранённая связь",
        }),
      );
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      act(() => result.current.workspace.openArtifact(agentLayerRule));
      act(() => result.current.workspace.selectSection("agent_profile"));
      act(() => result.current.workspace.copyBinding());
      await act(async () =>
        expect(
          await result.current.workspace.selectDraft("another-draft"),
        ).toBe(false),
      );
      expect(confirm).toHaveBeenCalledTimes(4);
      expect(result.current.editor.bindingForm?.originalKey).toBe(source.key);
      stored = { ...stored, revision: stored.revision + 1 };
      await act(async () => {
        await result.current.editor.save();
      });
      expect(result.current.configuration.errorKind).toBe("conflict");
      expect(result.current.configuration.hasPendingMutation).toBe(false);
      expect(result.current.editor.bindingForm?.baseline).toEqual(baseline);
      expect(writes).toBe(0);
      await act(async () =>
        expect(await result.current.workspace.refresh()).toBe(false),
      );
      expect(result.current.editor.bindingForm?.fields.title).toBe(
        "Несохранённая связь",
      );
      confirm.mockReturnValue(true);
      await act(async () =>
        expect(await result.current.workspace.refresh()).toBe(true),
      );
      expect(result.current.editor.bindingForm).toBeNull();
      expect(result.current.workspace.selectedArtifact).toBeUndefined();
      expect(result.current.workspace.catalog).toEqual(catalog);
    });

    it("сохраняет отсутствующие системные цели и ограничения при правке названия", async () => {
      const missing =
        source.kind === "capability_binding"
          ? {
              ...source,
              capability: { id: "missing.capability", version: "99.0" },
              allowedActions: ["missing.action"],
              readScopes: undefined,
              writeScopes: [],
              maxTargets: undefined,
            }
          : { ...source, checkID: "missing.check" };
      stored = {
        ...stored,
        artifacts: stored.artifacts.map((item) =>
          item.kind === kind ? missing : item,
        ),
      };
      const { result } = renderWorkspace();
      await waitFor(() =>
        expect(result.current.configuration.isLoading).toBe(false),
      );
      act(() => result.current.workspace.openArtifact(missing));
      const fields = structuredClone(result.current.editor.bindingForm!.fields);
      act(() =>
        result.current.editor.updateBinding({
          ...fields,
          title: "Старая связь",
        }),
      );
      await act(async () => {
        await result.current.editor.save();
      });
      expect(writes).toBe(1);
      expect(stored.artifacts.find((item) => item.kind === kind)).toEqual({
        ...missing,
        title: "Старая связь",
        revision: missing.revision + 1,
      });
      expect(result.current.editor.bindingForm?.baseline).toEqual({
        ...fields,
        title: "Старая связь",
      });
      act(() =>
        result.current.editor.updateBinding({
          ...fields,
          title: "Временное название",
        }),
      );
      vi.spyOn(window, "confirm").mockReturnValue(true);
      act(() => result.current.editor.reset());
      expect(result.current.editor.bindingForm?.fields).toEqual({
        ...fields,
        title: "Старая связь",
      });
      expect(result.current.editor.isDirty).toBe(false);
    });

    it("не позволяет изменять, создавать или копировать записи выпущенного черновика", async () => {
      stored = { ...stored, state: "released" };
      const { result } = renderWorkspace();
      await waitFor(() =>
        expect(result.current.configuration.isLoading).toBe(false),
      );
      act(() => result.current.workspace.openArtifact(source));
      expect(result.current.editor.isReadOnly).toBe(true);
      const original = structuredClone(result.current.editor.bindingForm);
      act(() =>
        result.current.editor.updateBinding({
          ...result.current.editor.bindingForm!.fields,
          title: "Недопустимая правка",
        }),
      );
      act(() => result.current.workspace.copyBinding());
      act(() => result.current.workspace.newBinding(kind));
      await act(async () => {
        await result.current.editor.save();
      });
      expect(result.current.editor.bindingForm).toEqual(original);
      expect(result.current.editor.isDirty).toBe(false);
      expect(writes).toBe(0);
    });

    it("на границе 512 записей блокирует добавление и копию, оставляя сохранение существующей записи", async () => {
      stored = {
        ...stored,
        artifacts: [
          source,
          ...Array.from({ length: 511 }, (_, index) => ({
            ...agentLayerRule,
            key: `limit.rule.${index}`,
          })),
        ],
        artifactCount: 512,
      };
      const { result } = renderWorkspace();
      await waitFor(() =>
        expect(result.current.configuration.isLoading).toBe(false),
      );
      act(() => result.current.workspace.newBinding(kind));
      expect(result.current.editor.bindingForm).toBeNull();
      act(() => result.current.workspace.openArtifact(source));
      act(() => result.current.workspace.copyBinding());
      expect(result.current.editor.bindingForm?.originalKey).toBe(source.key);
      act(() =>
        result.current.editor.updateBinding({
          ...result.current.editor.bindingForm!.fields,
          title: "Правка на границе лимита",
        }),
      );
      await act(async () => {
        await result.current.editor.save();
      });
      expect(writes).toBe(1);
      expect(stored.artifacts).toHaveLength(512);
      expect(result.current.editor.isDirty).toBe(false);
    });
  },
);

it("сохраняет неправильный текст лимита для исправления и не отправляет его в Config API", async () => {
  const source = AI_CONFIG_ARTIFACTS.find(
    (item) => item.kind === "capability_binding",
  )!;
  stored = { ...stored, artifacts: [...stored.artifacts, source] };
  const { result } = renderWorkspace();
  await waitFor(() =>
    expect(result.current.configuration.isLoading).toBe(false),
  );
  act(() => result.current.workspace.openArtifact(source));
  const fields = getAgentLayerBindingFields(source);
  if (fields.kind !== "capability_binding")
    throw new Error("Expected capability fixture");
  act(() =>
    result.current.editor.updateBinding({ ...fields, maxTargets: "1.5" }),
  );
  await act(async () => {
    await result.current.editor.save();
  });
  expect(result.current.editor.formError).toContain("Лимит объектов");
  expect(result.current.editor.bindingForm?.fields).toMatchObject({
    maxTargets: "1.5",
  });
  expect(result.current.editor.isDirty).toBe(true);
  expect(writes).toBe(0);
  act(() => result.current.editor.updateBinding({ ...fields, maxTargets: "" }));
  await act(async () => {
    await result.current.editor.save();
  });
  expect(
    stored.artifacts.find((item) => item.kind === "capability_binding"),
  ).not.toHaveProperty("maxTargets");
  expect(result.current.editor.formError).toBeUndefined();
  expect(result.current.editor.isDirty).toBe(false);
  expect(writes).toBe(1);
});

describe("workflow_definition: жизненный цикл редактора", () => {
  const source = AI_CONFIG_ARTIFACTS.find(
    (item) => item.kind === "workflow_definition",
  )!;
  beforeEach(() => {
    stored = {
      ...stored,
      artifacts: [...stored.artifacts, structuredClone(source)],
      artifactCount: stored.artifacts.length + 1,
    };
  });

  it("создаёт и копирует процесс локально, сохраняет выбор после записи и возвращает каталог", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    const neighbors = structuredClone(stored.artifacts);
    const catalog = {
      search: "каталог",
      status: "enabled",
      usage: "used",
      sort: "usage",
      page: 2,
    } as const;
    act(() => result.current.workspace.selectSection("workflow_definition"));
    act(() => result.current.workspace.setCatalog(catalog));
    act(() => result.current.workspace.newWorkflow());
    const identity = result.current.workspace.recordIdentity;
    expect(result.current.editor.workflowForm?.fields.kind).toBe(
      "workflow_definition",
    );
    expect(result.current.editor.isDirty).toBe(true);
    expect(writes).toBe(0);
    const fields = {
      ...getAgentLayerWorkflowFields(source),
      key: `${source.key}.new`,
    };
    act(() => result.current.editor.updateWorkflow(fields));
    await act(async () => {
      await result.current.editor.save();
    });
    expect(writes).toBe(1);
    expect(result.current.editor.isDirty).toBe(false);
    expect(result.current.editor.workflowForm?.fields).toEqual(fields);
    expect(result.current.workspace.recordIdentity).toBe(identity);
    expect(result.current.workspace.selectedArtifact).toEqual({
      ...source,
      key: `${source.key}.new`,
      revision: 1,
    });
    act(() => result.current.workspace.copyWorkflow());
    expect(writes).toBe(1);
    expect(result.current.workspace.recordIdentity).not.toBe(identity);
    expect(result.current.editor.workflowForm?.originalKey).toBeUndefined();
    expect(result.current.editor.workflowForm?.fields.key).toBe(
      `${source.key}.new.copy`,
    );
    expect(result.current.editor.workflowNotice).toContain("Копия");
    act(() =>
      result.current.editor.updateWorkflow({
        ...result.current.editor.workflowForm!.fields,
        enabled: false,
      }),
    );
    await act(async () => {
      await result.current.editor.save();
    });
    expect(writes).toBe(2);
    expect(result.current.editor.isDirty).toBe(false);
    expect(result.current.editor.workflowNotice).toBeUndefined();
    expect(result.current.workspace.selectedArtifact).toMatchObject({
      key: `${source.key}.new.copy`,
      revision: 1,
      enabled: false,
      steps: source.steps,
    });
    expect(stored.artifacts.slice(0, neighbors.length)).toEqual(neighbors);
    expect(
      stored.artifacts.find((item) => item.key === `${source.key}.new`),
    ).toMatchObject({ enabled: true });
    act(() => result.current.workspace.closeArtifact());
    expect(result.current.workspace.section).toBe("workflow_definition");
    expect(result.current.workspace.catalog).toEqual(catalog);
  });

  it.each(["ответа", "readback"])(
    "после потери %s сохраняет локальные шаги до подтверждения исходного body и ключа",
    async (failure) => {
      const { result } = renderWorkspace();
      await waitFor(() =>
        expect(result.current.configuration.isLoading).toBe(false),
      );
      const neighbors = structuredClone(
        stored.artifacts.filter((item) => item.kind !== "workflow_definition"),
      );
      act(() => result.current.workspace.openArtifact(source));
      const baseline = structuredClone(
        result.current.editor.workflowForm!.baseline,
      );
      act(() =>
        result.current.editor.updateWorkflow({
          ...result.current.editor.workflowForm!.fields,
          key: "ignored.rename",
          description: "Сохранить процесс с этими шагами",
          enabled: false,
        }),
      );
      const fields = structuredClone(
        result.current.editor.workflowForm!.fields,
      );
      expect(fields.key).toBe(source.key);
      loseMutationReply = failure === "ответа";
      failDetailAfterWrite = failure === "readback";
      await act(async () => {
        await result.current.editor.save();
      });
      expect(result.current.configuration.hasPendingMutation).toBe(true);
      expect(result.current.editor.isDirty).toBe(true);
      expect(result.current.editor.workflowForm?.baseline).toEqual(baseline);
      act(() => result.current.editor.updateWorkflow({ ...fields, steps: [] }));
      act(() => result.current.workspace.openArtifact(agentLayerRule));
      act(() => result.current.workspace.newWorkflow());
      expect(result.current.editor.workflowForm?.fields).toEqual(fields);
      await act(async () => {
        await result.current.editor.retry();
      });
      expect(writes).toBe(1);
      expect(result.current.editor.isDirty).toBe(false);
      expect(result.current.editor.workflowForm?.baseline).toEqual(fields);
      expect(result.current.workspace.selectedArtifact).toMatchObject({
        revision: source.revision + 1,
        description: fields.description,
        enabled: false,
        steps: source.steps,
      });
      expect(
        stored.artifacts.filter((item) => item.kind !== "workflow_definition"),
      ).toEqual(neighbors);
      expect(requests).toHaveLength(failure === "ответа" ? 2 : 1);
      if (failure === "ответа") expect(requests[0]).toEqual(requests[1]);
      await act(async () => {
        await result.current.editor.save();
      });
      expect(writes).toBe(1);
    },
  );

  it("после CAS-конфликта сохраняет ввод, baseline и каталог до явного обновления", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.selectSection("workflow_definition"));
    const catalog = {
      search: source.key,
      status: "all",
      usage: "all",
      sort: "revision",
      page: 2,
    } as const;
    act(() => result.current.workspace.setCatalog(catalog));
    act(() => result.current.workspace.openArtifact(source));
    const baseline = structuredClone(
      result.current.editor.workflowForm!.baseline,
    );
    act(() =>
      result.current.editor.updateWorkflow({
        ...baseline,
        title: "Мои шаги процесса",
      }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => result.current.workspace.openArtifact(agentLayerRule));
    act(() => result.current.workspace.selectSection("agent_profile"));
    act(() => result.current.workspace.copyWorkflow());
    await act(async () =>
      expect(await result.current.workspace.selectDraft("another-draft")).toBe(
        false,
      ),
    );
    expect(confirm).toHaveBeenCalledTimes(4);
    stored = {
      ...stored,
      revision: stored.revision + 1,
      artifacts: stored.artifacts.map((item) =>
        item.kind === "workflow_definition"
          ? {
              ...item,
              title: "Чужая новая версия",
              revision: item.revision + 1,
            }
          : item,
      ),
    };
    await act(async () => {
      await result.current.editor.save();
    });
    expect(result.current.configuration.errorKind).toBe("conflict");
    expect(result.current.configuration.hasPendingMutation).toBe(false);
    expect(result.current.editor.workflowForm?.baseline).toEqual(baseline);
    expect(result.current.editor.workflowForm?.fields.title).toBe(
      "Мои шаги процесса",
    );
    expect(writes).toBe(0);
    await act(async () =>
      expect(await result.current.workspace.refresh()).toBe(false),
    );
    expect(result.current.editor.isDirty).toBe(true);
    confirm.mockReturnValue(true);
    await act(async () =>
      expect(await result.current.workspace.refresh()).toBe(true),
    );
    expect(result.current.editor.workflowForm).toBeNull();
    expect(result.current.workspace.selectedArtifact).toBeUndefined();
    expect(result.current.workspace.catalog).toEqual(catalog);
    act(() =>
      result.current.workspace.openArtifact(
        result.current.configuration.draft!.artifacts.find(
          (item) => item.kind === "workflow_definition",
        )!,
      ),
    );
    expect(result.current.editor.workflowForm?.fields.title).toBe(
      "Чужая новая версия",
    );
    expect(result.current.editor.isDirty).toBe(false);
  });

  it.each(["переименование", "литерал"])(
    "сохраняет незавершённое поле «%s» при отмене выхода и позволяет явно сбросить ввод",
    async (invalidField) => {
      const { result } = renderWorkspace();
      await waitFor(() =>
        expect(result.current.configuration.isLoading).toBe(false),
      );
      act(() => result.current.workspace.openArtifact(source));
      const baseline = structuredClone(
        result.current.editor.workflowForm!.baseline,
      );
      const invalid: AgentLayerWorkflowInput = {
        ...baseline,
        steps: baseline.steps.map((step, index) => {
          if (invalidField === "переименование")
            return index === 0 ? { ...step, keyInput: "renamed.plan" } : step;
          return step.type === "capability"
            ? {
                ...step,
                input: step.input.map((row, rowIndex) =>
                  rowIndex === 0
                    ? {
                        ...row,
                        value: {
                          source: "literal",
                          value: { type: "object", valueText: "{" },
                        },
                      }
                    : row,
                ),
              }
            : step;
        }),
      };
      act(() => result.current.editor.updateWorkflow(invalid));
      expect(result.current.editor.isDirty).toBe(true);
      await act(async () => {
        await result.current.editor.save();
      });
      expect(result.current.editor.formError).toBeTruthy();
      expect(requests).toHaveLength(0);
      expect(result.current.editor.workflowForm?.fields).toEqual(invalid);
      expect(result.current.editor.workflowForm?.baseline).toEqual(baseline);
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      act(() => result.current.workspace.closeArtifact());
      expect(confirm).toHaveBeenCalledOnce();
      expect(result.current.editor.workflowForm?.fields).toEqual(invalid);
      act(() => result.current.editor.reset());
      expect(result.current.editor.workflowForm?.fields).toEqual(invalid);
      confirm.mockReturnValue(true);
      act(() => result.current.editor.reset());
      expect(result.current.editor.workflowForm?.fields).toEqual(baseline);
      expect(result.current.editor.isDirty).toBe(false);
      expect(result.current.editor.formError).toBeUndefined();
      act(() => result.current.editor.updateWorkflow(invalid));
      confirm.mockReturnValue(true);
      act(() => result.current.workspace.openArtifact(agentLayerRule));
      expect(result.current.editor.workflowForm).toBeNull();
      expect(result.current.editor.form?.originalKey).toBe(agentLayerRule.key);
      expect(
        stored.artifacts.find((item) => item.kind === "workflow_definition"),
      ).toEqual(source);
      expect(writes).toBe(0);
    },
  );

  it("сохраняет отсутствующие ссылки процесса при исправлении метаданных черновика", async () => {
    const missing = {
      ...source,
      entryStepKey: "missing.entry",
      steps: source.steps.map((step) =>
        step.type === "agent_turn"
          ? { ...step, promptTemplateKey: "missing.prompt" }
          : step.type === "capability"
            ? { ...step, capabilityBindingKey: "missing.capability" }
            : step.type === "check"
              ? {
                  ...step,
                  checkBindingKey: "missing.check",
                  nextStepKey: "missing.finish",
                }
              : step,
      ),
    };
    stored = {
      ...stored,
      artifacts: stored.artifacts.map((item) =>
        item.kind === "workflow_definition" ? missing : item,
      ),
    };
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.openArtifact(missing));
    act(() =>
      result.current.editor.updateWorkflow({
        ...result.current.editor.workflowForm!.fields,
        description: "Черновик для восстановления связей",
      }),
    );
    await act(async () => {
      await result.current.editor.save();
    });
    expect(writes).toBe(1);
    expect(result.current.editor.isDirty).toBe(false);
    expect(
      stored.artifacts.find((item) => item.kind === "workflow_definition"),
    ).toEqual({
      ...missing,
      description: "Черновик для восстановления связей",
      revision: missing.revision + 1,
    });
  });

  it("блокирует изменение, создание и копирование в выпущенном черновике", async () => {
    stored = { ...stored, state: "released" };
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.openArtifact(source));
    const original = structuredClone(result.current.editor.workflowForm);
    expect(result.current.editor.isReadOnly).toBe(true);
    act(() =>
      result.current.editor.updateWorkflow({
        ...result.current.editor.workflowForm!.fields,
        steps: [],
      }),
    );
    act(() => result.current.workspace.copyWorkflow());
    act(() => result.current.workspace.newWorkflow());
    await act(async () => {
      await result.current.editor.save();
    });
    expect(result.current.editor.workflowForm).toEqual(original);
    expect(result.current.editor.isDirty).toBe(false);
    expect(writes).toBe(0);
  });

  it("при 512 записях блокирует новый процесс и копию, сохраняя правки существующего", async () => {
    stored = {
      ...stored,
      artifacts: [
        source,
        ...Array.from({ length: 511 }, (_, index) => ({
          ...agentLayerRule,
          key: `limit.rule.${index}`,
        })),
      ],
      artifactCount: 512,
    };
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.newWorkflow());
    expect(result.current.editor.workflowForm).toBeNull();
    act(() => result.current.workspace.openArtifact(source));
    act(() => result.current.workspace.copyWorkflow());
    expect(result.current.editor.workflowForm?.originalKey).toBe(source.key);
    act(() =>
      result.current.editor.updateWorkflow({
        ...result.current.editor.workflowForm!.fields,
        title: "Процесс на границе лимита",
      }),
    );
    await act(async () => {
      await result.current.editor.save();
    });
    expect(writes).toBe(1);
    expect(stored.artifacts).toHaveLength(512);
    expect(result.current.editor.isDirty).toBe(false);
  });
});

const profile = agentLayerDraft.artifacts.find(
  (artifact): artifact is AIAgentProfileDefinition =>
    artifact.kind === "agent_profile",
)!;

describe("useAgentLayerConfiguration", () => {
  it("saves profile fields without changing other artifacts and keeps its stable key", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.openArtifact(profile));
    expect(result.current.editor.form).toBeNull();
    act(() => result.current.editor.updateProfile("key", "renamed"));
    expect(result.current.editor.profileForm?.fields.key).toBe(profile.key);
    act(() =>
      result.current.editor.updateProfile(
        "description",
        "Уточнённое назначение",
      ),
    );
    act(() => result.current.editor.updateProfile("locale", "en-US"));
    act(() => result.current.editor.updateProfile("ruleKeys", []));
    await act(async () => {
      await result.current.editor.save();
    });
    expect(result.current.editor.isDirty).toBe(false);
    expect(result.current.editor.profileForm?.baseline.description).toBe(
      "Уточнённое назначение",
    );
    expect(
      stored.artifacts.find((artifact) => artifact.kind === "agent_profile"),
    ).toEqual({
      ...profile,
      description: "Уточнённое назначение",
      locale: "en-US",
      ruleKeys: [],
      revision: 5,
    });
    expect(
      stored.artifacts.filter((artifact) => artifact.kind !== "agent_profile"),
    ).toEqual(
      agentLayerDraft.artifacts.filter(
        (artifact) => artifact.kind !== "agent_profile",
      ),
    );
    expect(stored.baseRelease).toEqual(agentLayerDraft.baseRelease);
    await act(async () => {
      await result.current.editor.save();
    });
    expect(writes).toBe(1);
  });

  it.each(["lost reply", "unavailable detail"] as const)(
    "preserves the profile form and replays its %s without a second write",
    async (mode) => {
      const { result } = renderWorkspace();
      await waitFor(() =>
        expect(result.current.configuration.isLoading).toBe(false),
      );
      act(() => result.current.workspace.openArtifact(profile));
      act(() =>
        result.current.editor.updateProfile("title", "Изменённый профиль"),
      );
      loseMutationReply = mode === "lost reply";
      failDetailAfterWrite = mode === "unavailable detail";
      await act(async () => {
        await result.current.editor.save();
      });
      expect(result.current.configuration.hasPendingMutation).toBe(true);
      act(() => result.current.workspace.openArtifact(agentLayerRule));
      act(() => result.current.editor.updateProfile("title", "Другой текст"));
      expect(result.current.editor.profileForm?.fields.title).toBe(
        "Изменённый профиль",
      );
      expect(result.current.editor.isDirty).toBe(true);
      await act(async () => {
        await result.current.editor.retry();
      });
      expect(result.current.editor.profileForm?.baseline.title).toBe(
        "Изменённый профиль",
      );
      expect(result.current.workspace.selectedArtifact?.title).toBe(
        "Изменённый профиль",
      );
      expect(result.current.editor.isDirty).toBe(false);
      expect(result.current.editor.form).toBeNull();
      expect(writes).toBe(1);
      expect(requests).toHaveLength(mode === "lost reply" ? 2 : 1);
      if (mode === "lost reply") expect(requests[0]).toEqual(requests[1]);
    },
  );

  it("keeps profile input on conflict and clears selection only after an accepted refresh", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.openArtifact(profile));
    act(() => result.current.editor.updateProfile("title", "Мои изменения"));
    stored = {
      ...stored,
      revision: 3,
      artifacts: stored.artifacts.map((artifact) =>
        artifact.kind === "agent_profile"
          ? { ...artifact, title: "Изменения коллеги", revision: 5 }
          : artifact,
      ),
    };
    await act(async () => {
      await result.current.editor.save();
    });
    expect(result.current.configuration.errorKind).toBe("conflict");
    expect(result.current.editor.profileForm?.fields.title).toBe(
      "Мои изменения",
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => {
      expect(await result.current.workspace.refresh()).toBe(false);
    });
    expect(result.current.editor.profileForm?.fields.title).toBe(
      "Мои изменения",
    );
    confirm.mockReturnValue(true);
    await act(async () => {
      expect(await result.current.workspace.refresh()).toBe(true);
    });
    expect(result.current.editor.profileForm).toBeNull();
    expect(result.current.workspace.selectedArtifact).toBeUndefined();
    act(() =>
      result.current.workspace.openArtifact(
        result.current.configuration.draft!.artifacts.find(
          (artifact) => artifact.kind === "agent_profile",
        )!,
      ),
    );
    expect(result.current.editor.profileForm?.fields.title).toBe(
      "Изменения коллеги",
    );
    expect(writes).toBe(0);
  });

  it("uses one dirty guard for profile/rule/draft navigation and clears removed default workflow atomically", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.selectSection("agent_profile"));
    act(() => result.current.workspace.openArtifact(profile));
    act(() =>
      result.current.editor.updateProfile("workflowKeys", ["workflow.one"]),
    );
    act(() =>
      result.current.editor.updateProfile("defaultWorkflowKey", "workflow.one"),
    );
    act(() => result.current.editor.updateProfile("workflowKeys", []));
    expect(
      result.current.editor.profileForm?.fields.defaultWorkflowKey,
    ).toBeUndefined();
    expect(result.current.editor.profileNotice).toContain(
      "Процесс по умолчанию снят",
    );
    act(() =>
      result.current.editor.updateProfile(
        "description",
        "Несохранённое назначение",
      ),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => result.current.workspace.openArtifact(agentLayerRule));
    act(() => result.current.workspace.selectSection("skill"));
    await act(async () => {
      expect(await result.current.workspace.selectDraft("other-draft")).toBe(
        false,
      );
    });
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(result.current.editor.profileForm?.fields.description).toBe(
      "Несохранённое назначение",
    );
    expect(result.current.editor.form).toBeNull();
    confirm.mockReturnValue(true);
    act(() => result.current.workspace.openArtifact(agentLayerRule));
    expect(result.current.editor.profileForm).toBeNull();
    expect(result.current.editor.form?.originalKey).toBe(agentLayerRule.key);
    act(() => result.current.workspace.closeArtifact());
    expect(result.current.workspace.section).toBe("agent_profile");
    expect(writes).toBe(0);
  });

  it("creates and copies profiles only on save, retaining the source and catalog context", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.selectSection("agent_profile"));
    act(() => result.current.workspace.newProfile());
    act(() => result.current.editor.updateProfile("key", "new.agent"));
    act(() => result.current.editor.updateProfile("title", "Новый агент"));
    act(() =>
      result.current.editor.updateProfile(
        "description",
        "Назначение нового агента",
      ),
    );
    expect(writes).toBe(0);
    await act(async () => {
      await result.current.editor.save();
    });
    expect(result.current.editor.profileForm?.originalKey).toBe("new.agent");
    expect(result.current.workspace.selectedArtifact?.revision).toBe(1);
    act(() => result.current.workspace.copyProfile());
    const copied = structuredClone(result.current.editor.profileForm!.fields);
    expect(copied.key).not.toBe("new.agent");
    expect(result.current.editor.isDirty).toBe(true);
    expect(writes).toBe(1);
    await act(async () => {
      await result.current.editor.save();
    });
    expect(result.current.editor.profileForm?.originalKey).toBe(copied.key);
    expect(
      stored.artifacts.filter((artifact) => artifact.kind === "agent_profile"),
    ).toHaveLength(3);
    expect(
      stored.artifacts.find(
        (artifact) =>
          artifact.kind === "agent_profile" && artifact.key === profile.key,
      ),
    ).toEqual(profile);
    act(() => result.current.workspace.closeArtifact());
    expect(result.current.workspace.section).toBe("agent_profile");
    expect(writes).toBe(2);
  });

  it("does not apply a failed create intent when retrying profile validation", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.openArtifact(profile));
    const fetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) =>
        init?.method === "POST" && url.endsWith("/config/drafts")
          ? Promise.resolve(
              Response.json(
                {
                  ok: false,
                  error: { code: "CONFLICT", message: "Draft exists" },
                },
                { status: 409 },
              ),
            )
          : fetch(url, init),
      ),
    );
    await act(async () => {
      expect(await result.current.workspace.createDraft(true)).toBe(false);
    });
    expect(result.current.configuration.hasPendingMutation).toBe(false);
    loseMutationReply = true;
    await act(async () => {
      await result.current.editor.validate();
    });
    expect(result.current.configuration.hasPendingMutation).toBe(true);
    await act(async () => {
      await result.current.editor.retry();
    });
    expect(result.current.editor.profileForm?.originalKey).toBe(profile.key);
    expect(result.current.workspace.selectedArtifact?.key).toBe(profile.key);
    expect(result.current.configuration.validation?.valid).toBe(true);
    expect(writes).toBe(1);
  });
  it("only reads on mount and retains the selected draft and editor data after conflict", async () => {
    const { result } = renderHook(() => useAgentLayerConfiguration());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(writes).toBe(0);
    expect(result.current.draft?.id).toBe("draft-fixture");
    stored = { ...stored, revision: 3 };
    await act(async () => {
      expect(
        await result.current.saveRule(
          { ...agentLayerRule, instruction: "Локальные правки" },
          agentLayerRule.key,
        ),
      ).toBe(false);
    });
    expect(result.current.errorKind).toBe("conflict");
    expect(result.current.draft?.revision).toBe(2);
    expect(result.current.hasPendingMutation).toBe(false);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.draft?.revision).toBe(3);
  });
  it("retries the identical body and key after a lost mutation response and blocks other writes", async () => {
    const { result } = renderHook(() => useAgentLayerConfiguration());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    loseMutationReply = true;
    await act(async () => {
      expect(
        await result.current.saveRule(
          { ...agentLayerRule, instruction: "Сохранить один раз" },
          agentLayerRule.key,
        ),
      ).toBe(false);
    });
    expect(result.current.hasPendingMutation).toBe(true);
    expect(result.current.draft?.revision).toBe(2);
    await act(async () => {
      expect(await result.current.selectDraft("another")).toBe(false);
      expect(
        await result.current.saveRule(
          { ...agentLayerRule, instruction: "Другой запрос" },
          agentLayerRule.key,
        ),
      ).toBe(false);
    });
    await act(async () => {
      expect(await result.current.retryMutation()).toBe(true);
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
    expect(writes).toBe(1);
    expect(result.current.draft?.revision).toBe(3);
    expect(result.current.hasPendingMutation).toBe(false);
    expect(result.current.draft?.artifacts.slice(1)).toEqual(
      agentLayerDraft.artifacts.slice(1),
    );
  });
  it("retries only the detail read when the server already confirmed the write", async () => {
    const { result } = renderHook(() => useAgentLayerConfiguration());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    failDetailAfterWrite = true;
    await act(async () => {
      expect(
        await result.current.saveRule(
          { ...agentLayerRule, enabled: false },
          agentLayerRule.key,
        ),
      ).toBe(false);
    });
    expect(result.current.hasPendingMutation).toBe(true);
    expect(result.current.error).toContain("подтверждены сервером");
    await act(async () => {
      expect(await result.current.retryMutation()).toBe(true);
    });
    expect(requests).toHaveLength(1);
    expect(writes).toBe(1);
    expect(result.current.rules[0].enabled).toBe(false);
  });
  it("blocks referenced rule deletion without issuing a mutation", async () => {
    const { result } = renderHook(() => useAgentLayerConfiguration());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      expect(await result.current.removeRule("local.rule")).toBe(false);
    });
    expect(result.current.error).toContain("Редактор каталога");
    expect(requests).toHaveLength(0);
  });
  it.each(["immediate", "lost reply", "unavailable detail"] as const)(
    "requires explicit reload instead of rebasing stale form fields after newer %s readback",
    async (mode) => {
      const { result } = renderHook(() => {
        const configuration = useAgentLayerConfiguration();
        const editor = useAgentLayerEditor({ configuration });
        return { configuration, editor };
      });
      await waitFor(() =>
        expect(result.current.configuration.isLoading).toBe(false),
      );
      act(() => result.current.editor.selectRule(agentLayerRule));
      act(() =>
        result.current.editor.update("title", "Название из этой вкладки"),
      );
      changeRuleBeforeReadback = true;
      loseMutationReply = mode === "lost reply";
      failDetailAfterWrite = mode === "unavailable detail";
      await act(async () => {
        await result.current.editor.save();
      });
      if (mode !== "immediate") {
        expect(result.current.configuration.hasPendingMutation).toBe(true);
        await act(async () => {
          await result.current.editor.retry();
        });
      }
      expect(writes).toBe(1);
      expect(result.current.configuration.errorKind).toBe("conflict");
      expect(result.current.configuration.error).toContain(
        "Запись подтверждена",
      );
      expect(result.current.configuration.hasPendingMutation).toBe(false);
      expect(result.current.configuration.draft?.revision).toBe(
        agentLayerDraft.revision,
      );
      expect(result.current.editor.isDirty).toBe(true);
      expect(result.current.editor.form?.fields).toMatchObject({
        title: "Название из этой вкладки",
        instruction: agentLayerRule.instruction,
      });
      expect(result.current.editor.form?.baseline.title).toBe(
        agentLayerRule.title,
      );
      // Повторное сохранение старой формы сохраняет исходный CAS и получает 409, а не стирает чужое правило.
      await act(async () => {
        await result.current.editor.save();
      });
      expect(writes).toBe(1);
      expect(JSON.parse(requests.at(-1)!.body).expectedRevision).toBe(
        agentLayerDraft.revision,
      );
      expect(stored.artifacts[0]).toMatchObject({
        instruction: "Правка другого редактора.",
      });
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      await act(async () => {
        await result.current.editor.refresh();
      });
      expect(confirm).toHaveBeenCalledOnce();
      confirm.mockRestore();
      expect(result.current.editor.form).toBeNull();
      expect(result.current.configuration.draft?.revision).toBe(
        stored.revision,
      );
      act(() =>
        result.current.editor.selectRule(result.current.configuration.rules[0]),
      );
      expect(result.current.editor.form?.fields.instruction).toBe(
        "Правка другого редактора.",
      );
      expect(result.current.editor.isDirty).toBe(false);
    },
  );
});

describe("agent layer workspace navigation", () => {
  it("clears record selection only after a confirmed refresh and retains its catalog", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.selectSection("local_rule"));
    const catalog = {
      search: "каталог",
      status: "enabled",
      usage: "used",
      sort: "usage",
      page: 2,
    } as const;
    act(() => result.current.workspace.setCatalog(catalog));
    act(() => result.current.workspace.openArtifact(agentLayerRule));
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Read unavailable"));
    await act(async () =>
      expect(await result.current.workspace.refresh()).toBe(false),
    );
    expect(result.current.workspace.selectedArtifact?.key).toBe(
      agentLayerRule.key,
    );
    expect(result.current.editor.form?.originalKey).toBe(agentLayerRule.key);
    act(() => result.current.editor.update("instruction", "Локальный ввод"));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const reads = vi.mocked(fetch).mock.calls.length;
    await act(async () =>
      expect(await result.current.workspace.refresh()).toBe(false),
    );
    expect(vi.mocked(fetch).mock.calls).toHaveLength(reads);
    expect(result.current.editor.form?.fields.instruction).toBe(
      "Локальный ввод",
    );
    confirm.mockReturnValue(true);
    await act(async () =>
      expect(await result.current.workspace.refresh()).toBe(true),
    );
    expect(result.current.workspace.selectedArtifact).toBeUndefined();
    expect(result.current.editor.form).toBeNull();
    expect(result.current.workspace.section).toBe("local_rule");
    expect(result.current.workspace.catalog).toEqual(catalog);
  });

  it("does not resurrect a record without its form after switching A to B and back to A", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.selectSection("local_rule"));
    act(() => result.current.workspace.openArtifact(agentLayerRule));
    stored = { ...stored, id: "draft-another" };
    await act(async () =>
      expect(await result.current.workspace.selectDraft(stored.id)).toBe(true),
    );
    expect(result.current.workspace.selectedArtifact).toBeUndefined();
    expect(result.current.editor.form).toBeNull();
    stored = structuredClone(agentLayerDraft);
    await act(async () =>
      expect(await result.current.workspace.selectDraft(stored.id)).toBe(true),
    );
    expect(result.current.workspace.selectedArtifact).toBeUndefined();
    expect(result.current.editor.form).toBeNull();
    act(() => result.current.workspace.openArtifact(agentLayerRule));
    await act(async () =>
      expect(await result.current.workspace.selectDraft(stored.id)).toBe(false),
    );
    expect(result.current.workspace.selectedArtifact?.key).toBe(
      agentLayerRule.key,
    );
    expect(result.current.editor.form?.originalKey).toBe(agentLayerRule.key);
  });

  it.each(["create", "remove"] as const)(
    "retains the open rule when validation is retried after a confirmed %s operation",
    async (operation) => {
      const temporary = {
        ...agentLayerRule,
        key: "temporary.rule",
        title: "Временное правило",
      };
      stored = {
        ...stored,
        artifacts: [agentLayerRule, temporary],
        artifactCount: 2,
      };
      const { result } = renderWorkspace();
      await waitFor(() =>
        expect(result.current.configuration.isLoading).toBe(false),
      );
      if (operation === "create") {
        await act(async () =>
          expect(await result.current.workspace.createDraft(true)).toBe(true),
        );
      } else {
        act(() => result.current.workspace.openArtifact(temporary));
        vi.spyOn(window, "confirm").mockReturnValue(true);
        await act(async () => {
          await result.current.editor.remove();
        });
      }
      act(() =>
        result.current.workspace.openArtifact(
          result.current.configuration.rules[0],
        ),
      );
      loseMutationReply = true;
      await act(async () =>
        expect(await result.current.configuration.validateDraft()).toBe(false),
      );
      expect(result.current.configuration.hasPendingMutation).toBe(true);
      expect(result.current.editor.form?.originalKey).toBe(agentLayerRule.key);
      await act(async () => {
        await result.current.editor.retry();
      });
      expect(result.current.configuration.hasPendingMutation).toBe(false);
      expect(result.current.configuration.validation?.valid).toBe(true);
      expect(result.current.editor.form?.originalKey).toBe(agentLayerRule.key);
      expect(result.current.workspace.selectedArtifact?.key).toBe(
        agentLayerRule.key,
      );
      expect(result.current.editor.isDirty).toBe(false);
      expect(writes).toBe(2);
      expect(requests.at(-1)).toEqual(requests.at(-2));
    },
  );

  it.each(["save", "create", "remove"] as const)(
    "preserves the pending %s intent until its exact operation is confirmed",
    async (operation) => {
      stored = { ...stored, artifacts: [agentLayerRule], artifactCount: 1 };
      const { result } = renderWorkspace();
      await waitFor(() =>
        expect(result.current.configuration.isLoading).toBe(false),
      );
      act(() => result.current.workspace.openArtifact(agentLayerRule));
      loseMutationReply = true;
      if (operation === "save") {
        act(() =>
          result.current.editor.update("title", "Сохранённое название"),
        );
        await act(async () => {
          await result.current.editor.save();
        });
      } else if (operation === "create") {
        await act(async () =>
          expect(await result.current.workspace.createDraft(true)).toBe(false),
        );
      } else {
        vi.spyOn(window, "confirm").mockReturnValue(true);
        await act(async () => {
          await result.current.editor.remove();
        });
      }
      expect(result.current.configuration.hasPendingMutation).toBe(true);
      expect(result.current.editor.form?.originalKey).toBe(agentLayerRule.key);
      await act(async () =>
        expect(await result.current.workspace.refresh()).toBe(false),
      );
      await act(async () => {
        await result.current.editor.retry();
      });
      expect(result.current.configuration.hasPendingMutation).toBe(false);
      expect(result.current.editor.isDirty).toBe(false);
      if (operation === "save") {
        expect(result.current.editor.form?.baseline.title).toBe(
          "Сохранённое название",
        );
        expect(result.current.workspace.selectedArtifact?.title).toBe(
          "Сохранённое название",
        );
      } else {
        expect(result.current.editor.form).toBeNull();
        expect(result.current.workspace.selectedArtifact).toBeUndefined();
      }
      expect(writes).toBe(1);
      expect(requests).toHaveLength(2);
      expect(requests[0]).toEqual(requests[1]);
    },
  );

  it("moves focus on navigation without stealing it during rule input or save", async () => {
    const { result } = renderWorkspace();
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    const content = document.createElement("div");
    content.innerHTML = "<h2>Запись</h2><input aria-label='Название' />";
    document.body.append(content);
    result.current.workspace.contentRef.current = content;
    try {
      act(() => result.current.workspace.openArtifact(agentLayerRule));
      expect(document.activeElement).toBe(content.querySelector("h2"));
      const input = content.querySelector("input")!;
      input.focus();
      act(() => result.current.editor.update("title", "Новое название"));
      expect(document.activeElement).toBe(input);
      await act(async () => {
        await result.current.editor.save();
      });
      expect(document.activeElement).toBe(input);
      act(() => result.current.workspace.closeArtifact());
      expect(document.activeElement).toBe(content.querySelector("h2"));
    } finally {
      content.remove();
    }
  });

  it("retains catalog context and blocks section/record changes while dirty input is kept", async () => {
    const { result } = renderHook(() => {
      const configuration = useAgentLayerConfiguration();
      const editor = useAgentLayerEditor({ configuration });
      const workspace = useAgentLayerWorkspace({ configuration, editor });
      return { configuration, editor, workspace };
    });
    await waitFor(() =>
      expect(result.current.configuration.isLoading).toBe(false),
    );
    act(() => result.current.workspace.selectSection("local_rule"));
    act(() =>
      result.current.workspace.setCatalog({
        search: "каталог",
        status: "enabled",
        usage: "used",
        sort: "usage",
        page: 2,
      }),
    );
    act(() => result.current.workspace.openArtifact(agentLayerRule));
    act(() =>
      result.current.editor.update("instruction", "Несохранённая инструкция"),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => result.current.workspace.selectSection("skill"));
    expect(result.current.workspace.section).toBe("local_rule");
    expect(result.current.editor.form?.fields.instruction).toBe(
      "Несохранённая инструкция",
    );
    const related = agentLayerDraft.artifacts.find(
      (artifact) => artifact.kind === "agent_profile",
    )!;
    act(() => result.current.workspace.openArtifact(related));
    expect(result.current.workspace.selectedArtifact?.kind).toBe("local_rule");
    confirm.mockReturnValue(true);
    act(() => result.current.workspace.openArtifact(related));
    expect(result.current.workspace.selectedArtifact?.kind).toBe(
      "agent_profile",
    );
    expect(result.current.editor.form).toBeNull();
    act(() => result.current.workspace.closeArtifact());
    expect(result.current.workspace.section).toBe("local_rule");
    expect(result.current.workspace.catalog).toEqual({
      search: "каталог",
      status: "enabled",
      usage: "used",
      sort: "usage",
      page: 2,
    });
    expect(writes).toBe(0);
    confirm.mockRestore();
  });
});
