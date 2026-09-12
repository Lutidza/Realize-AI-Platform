// @vitest-environment node
/**
 * @file tests/int/workflowRunDetail.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Проверяет историческую проекцию workflow, typed результаты и owned операции без runtime вызовов.
 */

import type {
  AIConfigArtifact,
  AIChatConfigurationSnapshot,
  DataOperationState,
  WorkflowCheckpoint,
  WorkflowStep,
} from "@realize/ai-contracts";
import {
  advanceWorkflowBranch,
  awaitWorkflowInput,
  compileAgentConfiguration,
  completeWorkflowStep,
  finishWorkflow,
  initializeWorkflow,
  resumeWorkflowInput,
  startWorkflowAgentTurn,
  SYSTEM_AI_CONFIG_PROJECTION,
} from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_CONFIG_ARTIFACTS,
  createAIConfigDraftFixture,
  createAIConfigReleaseFixture,
} from "./fixtures/aiConfiguration";
import { WorkflowRunRegistryRepository } from "../../packages/payload-ai-plugin/src/endpoints/WorkflowRunRegistry.repository";
import { DataOperationRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationRepository";
import { DataOperationAuditRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationAuditRepository";
import { AIConfigRepository } from "../../packages/payload-ai-plugin/src/endpoints/aiConfigRepository";
import { getWorkflowRunDetail } from "../../packages/payload-ai-plugin/src/endpoints/getWorkflowRunDetail.service";
import { toWorkflowRegistryItem } from "../../packages/payload-ai-plugin/src/endpoints/toWorkflowRegistryItem.mapper";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";

const operationHash = "a".repeat(64);
const evidenceHash = "b".repeat(64);
const createdAt = "2026-09-11T10:00:00.000Z";
const req = {
  payload: { db: { pool: { query: vi.fn() } } },
  user: { id: 1 },
} as unknown as PayloadRequest;
const options = {
  enabled: true,
  access: { canManageData: () => true, canManageAIConfiguration: () => true },
} as unknown as SanitizedRealizeAIPluginOptions;

beforeEach(() => {
  vi.restoreAllMocks();
});

const fixture = () => {
  // Порядок деклараций не совпадает с execution path: timeline должна восстановить граф.
  const steps: WorkflowStep[] = [
    { key: "done", type: "finish", outcome: "completed" },
    {
      key: "question",
      type: "request_input",
      promptTemplateKey: "planner",
      nextStepKey: "answer",
    },
    {
      key: "check",
      type: "check",
      checkBindingKey: "payload-access",
      nextStepKey: "done",
    },
    {
      key: "answer",
      type: "agent_turn",
      promptTemplateKey: "planner",
      nextStepKey: "branch",
    },
    { key: "skip", type: "finish", outcome: "blocked" },
    {
      key: "change",
      type: "capability",
      capabilityBindingKey: "catalog-category",
      nextStepKey: "check",
      input: {},
    },
    {
      key: "branch",
      type: "branch",
      condition: {
        left: { source: "input", path: "/proceed" },
        operator: "equals",
        right: { source: "literal", value: true },
      },
      trueStepKey: "change",
      falseStepKey: "skip",
    },
  ];
  const artifacts: AIConfigArtifact[] = AI_CONFIG_ARTIFACTS.map((artifact) =>
    artifact.kind === "workflow_definition"
      ? { ...artifact, steps, entryStepKey: "question", maxSteps: steps.length }
      : artifact.kind === "local_role"
        ? { ...artifact, instructions: "PRIVATE_ROLE_INSTRUCTION" }
        : artifact,
  );
  const release = createAIConfigReleaseFixture(
    createAIConfigDraftFixture(artifacts),
  );
  const configuration: AIChatConfigurationSnapshot = {
    schemaVersion: "1.0",
    pointerVersion: 1,
    releaseVersion: 1,
    compiled: compileAgentConfiguration({
      release,
      system: SYSTEM_AI_CONFIG_PROJECTION,
      profileKey: "admin",
    }),
  };
  const root = awaitWorkflowInput(
    configuration,
    initializeWorkflow(
      configuration,
      "catalog-edit",
      "Собственный проверочный запрос",
      { proceed: true, hidden: "PRIVATE_INPUT_VALUE" },
    ),
  );
  const answered = completeWorkflowStep(
    configuration,
    startWorkflowAgentTurn(
      configuration,
      resumeWorkflowInput(configuration, root, "Собственный ответ"),
    ),
    { text: "Готово sk-fixtureabcdefghijklmno " + "x".repeat(8_001) },
  );
  let completed = advanceWorkflowBranch(configuration, answered);
  completed = completeWorkflowStep(
    configuration,
    completed,
    {
      dataOperationID: "41",
      operationHash,
      state: "awaiting_approval",
      privateExtra: "PRIVATE_EXTRA",
    },
    { stepKey: "change", dataOperationID: "41", operationHash },
  );
  completed = completeWorkflowStep(configuration, completed, {
    checkID: "payload.access",
    status: "passed",
    dataOperationID: "41",
    operationHash,
    evidenceHash,
    privateExtra: "PRIVATE_CHECK_EXTRA",
  });
  completed = finishWorkflow(configuration, completed);
  const run = (
    checkpoint: WorkflowCheckpoint,
    id: string,
    parentRunID?: string,
  ): AIDocument => ({
    id,
    requestedBy: 1,
    conversation: 7,
    status: "completed",
    createdAt,
    updatedAt: createdAt,
    turnContext: {
      workflowSourceMessageID: "11",
      agentConfiguration: configuration,
      workflow: {
        ...checkpoint,
        rootRunID: "1",
        ...(parentRunID ? { parentRunID } : {}),
      },
    },
  });
  const runs = [
    run(root, "1"),
    run(answered, "2", "1"),
    run(completed, "3", "2"),
  ];
  const conversation = {
    id: 7,
    title: "Собственный тестовый диалог",
    status: "active",
  };
  const operation: AIDocument = {
    id: 41,
    conversation: 7,
    requestedBy: 1,
    sourceMessage: 11,
    operationHash,
    rollbackHash: "c".repeat(64),
    state: "awaiting_approval",
    version: 1,
    createdAt,
    updatedAt: createdAt,
    expiresAt: "2030-01-01T00:00:00.000Z",
    title: "Собственное изменение",
    productSnapshot: { id: "5", title: "Тестовый товар" },
    categorySnapshot: { id: "6", title: "Тестовая категория" },
    beforeSnapshot: [],
    afterSnapshot: [{ id: "6", title: "Тестовая категория" }],
  };
  const preview: AIDocument = {
    id: 51,
    payload: {
      workflow: {
        type: "workflow",
        rootRunID: "1",
        stepKey: "change",
        compiledContextHash: configuration.compiled.compiledContextHash,
      },
    },
  };
  const chain = vi
    .spyOn(WorkflowRunRegistryRepository.prototype, "getOwnedChain")
    .mockImplementation(async (_id, userID) => {
      if (String(userID) !== "1")
        throw Object.assign(new Error("Not found"), { status: 404 });
      return { conversation, runs };
    });
  const owned = vi
    .spyOn(DataOperationRepository.prototype, "getOwnedOperation")
    .mockResolvedValue(operation);
  const audit = vi
    .spyOn(DataOperationAuditRepository.prototype, "getPreviewEvent")
    .mockResolvedValue(preview);
  vi.spyOn(
    DataOperationAuditRepository.prototype,
    "getApproval",
  ).mockResolvedValue(undefined);
  const active = vi
    .spyOn(AIConfigRepository.prototype, "getActivePointer")
    .mockRejectedValue(new Error("Active pointer must not be read"));
  const read = () => getWorkflowRunDetail(req, options, 1, "1");
  return {
    runs,
    conversation,
    operation,
    configuration,
    preview,
    root,
    answered,
    completed,
    chain,
    owned,
    audit,
    active,
    read,
  };
};

describe("Историческая workflow проекция", () => {
  it("восстанавливает все шесть типов шагов по графу, отделяет сегменты и не выдаёт private JSON", async () => {
    const f = fixture();
    const dto = await f.read();
    expect(dto.steps.map((step) => step.key)).toEqual([
      "question",
      "answer",
      "branch",
      "change",
      "check",
      "done",
      "skip",
    ]);
    expect(dto.segments.map((segment) => segment.completedStepKeys)).toEqual([
      [],
      ["question", "answer"],
      ["branch", "change", "check", "done"],
    ]);
    expect(dto.steps.find((step) => step.key === "skip")?.status).toBe(
      "skipped",
    );
    expect(
      dto.steps.find((step) => step.key === "answer")?.result,
    ).toMatchObject({ type: "text", truncated: true });
    const serialized = JSON.stringify(dto);
    for (const value of [
      "PRIVATE_ROLE_INSTRUCTION",
      "PRIVATE_INPUT_VALUE",
      "PRIVATE_EXTRA",
      "PRIVATE_CHECK_EXTRA",
      "sk-fixtureabcdefghijklmno",
      "turnContext",
      '"compiled":',
    ])
      expect(serialized).not.toContain(value);
    expect(serialized).toContain("[REDACTED]");
    expect(
      dto.steps.every(
        (step) => !("createdAt" in step) && !("startedAt" in step),
      ),
    ).toBe(true);
    expect(dto.item.latestRun.agentConfiguration?.releaseID).toBe(
      f.configuration.compiled.configReleaseID,
    );
    expect(f.active).not.toHaveBeenCalled();
    expect(f.owned).toHaveBeenCalledWith("41", 1);
  });

  it.each<DataOperationState>([
    "awaiting_approval",
    "approved",
    "applied",
    "rejected",
    "rollback_approved",
    "rolled_back",
    "apply_failed",
  ])(
    "сохраняет актуальную операцию %s для последующих действий",
    async (state) => {
      const f = fixture();
      f.operation.state = state;
      f.operation.expiresAt = "2020-01-01T00:00:00.000Z";
      const dto = await f.read();
      expect(dto.dataOperations).toHaveLength(1);
      expect(dto.dataOperations[0].state).toBe(state);
      expect(
        dto.steps.find((step) => step.key === "change")?.result,
      ).toMatchObject({ type: "capability", state });
      expect(
        dto.steps.find((step) => step.key === "check")?.result,
      ).toMatchObject({ type: "check", status: "passed" });
    },
  );

  it("выключенный агент сохраняет историю и право менеджера для отказа и отката", async () => {
    fixture();
    const dto = await getWorkflowRunDetail(
      req,
      { ...options, enabled: false },
      1,
      "1",
    );
    expect(dto.dataOperations).toHaveLength(1);
    expect(
      dto.steps.find((step) => step.key === "change")?.result,
    ).toMatchObject({
      type: "capability",
      state: "awaiting_approval",
    });
    expect(dto.permissions).toEqual({
      canManageData: true,
      canManageConfiguration: true,
    });
    expect(dto.item.actions).toMatchObject({
      continue: false,
      reply: false,
      recover: false,
      cancel: false,
    });
  });

  it("отсутствие права записи сохраняет историю операций с запрещёнными mutation permissions", async () => {
    fixture();
    const dto = await getWorkflowRunDetail(
      req,
      {
        ...options,
        access: {
          ...options.access,
          canManageData: () => false,
          canManageAIConfiguration: () => false,
        },
      },
      1,
      "1",
    );
    expect(dto.dataOperations).toHaveLength(1);
    expect(dto.permissions).toEqual({
      canManageData: false,
      canManageConfiguration: false,
    });
  });

  it("awaiting_input показывает только публичный вопрос и текущий сегмент", async () => {
    const f = fixture();
    f.runs.splice(1);
    const dto = await f.read();
    expect(dto.item.actions.reply).toBe(true);
    expect(dto.steps[0]).toMatchObject({
      key: "question",
      status: "current",
      result: { type: "text" },
    });
    expect(dto.dataOperations).toEqual([]);
    expect(f.owned).not.toHaveBeenCalled();
    expect(JSON.stringify(dto)).not.toContain("PRIVATE_INPUT_VALUE");
  });

  it("другая роль не обходит owned repository", async () => {
    fixture();
    await expect(
      getWorkflowRunDetail(req, options, 2, "1"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it.each(["conversation", "requestedBy", "sourceMessage", "operationHash"])(
    "отклоняет подмену receipt поля %s",
    async (field) => {
      const f = fixture();
      f.operation[field] = "999";
      await expect(f.read()).rejects.toMatchObject({ status: 409 });
    },
  );

  it("отклоняет чужой preview provenance и повреждённый check output", async () => {
    const f = fixture();
    f.audit.mockResolvedValue({
      id: 51,
      payload: {
        workflow: { type: "workflow", rootRunID: "900", stepKey: "change" },
      },
    });
    await expect(f.read()).rejects.toMatchObject({ status: 409 });
    f.audit.mockResolvedValue(f.preview);
    const context = f.runs[2].turnContext as { workflow: WorkflowCheckpoint };
    context.workflow.outputs.check = {
      checkID: "payload.access",
      status: "invented",
      dataOperationID: "41",
      operationHash,
      evidenceHash,
    };
    await expect(f.read()).rejects.toMatchObject({ status: 409 });
  });

  it("отклоняет переписанный parent output и подмену исходного input", async () => {
    const f = fixture();
    const context = f.runs[2].turnContext as { workflow: WorkflowCheckpoint };
    context.workflow.outputs.question = { text: "Другой ответ" };
    await expect(f.read()).rejects.toMatchObject({ status: 409 });
    context.workflow.outputs.question = f.answered.outputs.question;
    context.workflow.input = {
      ...context.workflow.input,
      hidden: "Подмена input",
    };
    await expect(f.read()).rejects.toMatchObject({ status: 409 });
  });

  it("отклоняет замену исторического snapshot даже на валидный другой pointer version", async () => {
    const f = fixture();
    const context = f.runs[2].turnContext as {
      agentConfiguration: AIChatConfigurationSnapshot;
    };
    context.agentConfiguration = {
      ...context.agentConfiguration,
      pointerVersion: 2,
    };
    await expect(f.read()).rejects.toMatchObject({ status: 409 });
  });
});

describe("Действия leaf в строке реестра", () => {
  it.each(["archived", "disabled"])(
    "режим %s сохраняет чтение и отмену активного запуска при выключении",
    (mode) => {
      const f = fixture();
      const run = {
        ...f.runs[0],
        status: "queued",
        turnContext: {
          workflow: {
            ...startWorkflowAgentTurn(
              f.configuration,
              resumeWorkflowInput(f.configuration, f.root, "Ответ"),
            ),
            rootRunID: "1",
          },
          agentConfiguration: f.configuration,
        },
      };
      const item = toWorkflowRegistryItem({
        rootRunID: "1",
        rootCreatedAt: createdAt,
        latestRun: run,
        conversation: {
          ...f.conversation,
          status: mode === "archived" ? "archived" : "active",
        },
        segmentCount: 1,
        enabled: mode !== "disabled",
      });
      expect(item.actions).toMatchObject({
        continue: false,
        reply: false,
        recover: false,
        cancel: mode === "disabled",
      });
      expect(item.actions.reason).toBeTruthy();
    },
  );

  it("paused, queued и terminal AIRun разделяют continue/recover/cancel", () => {
    const f = fixture();
    const map = (latestRun: AIDocument) =>
      toWorkflowRegistryItem({
        rootRunID: "1",
        rootCreatedAt: createdAt,
        latestRun,
        conversation: f.conversation,
        segmentCount: 1,
        enabled: true,
      });
    expect(map(f.runs[0]).actions).toMatchObject({
      reply: true,
      cancel: false,
    });
    expect(map(f.runs[1]).actions).toMatchObject({
      continue: true,
      cancel: false,
    });
    expect(map(f.runs[2]).actions).toMatchObject({
      continue: false,
      reply: false,
      recover: false,
      cancel: false,
    });
  });
});
