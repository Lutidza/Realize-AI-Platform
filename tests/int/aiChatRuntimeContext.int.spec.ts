// @vitest-environment node
/**
 * @file tests/int/aiChatRuntimeContext.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет границы конфигурации control plane, reuse thread и публичную проекцию без вызовов модели.
 */
import { describe, expect, it, vi } from "vitest";
import type { Payload, PayloadRequest } from "payload";
import { parseCreateMessageInput } from "@realize/ai-contracts";
import {
  compileAgentConfiguration,
  SYSTEM_AI_CONFIG_PROJECTION,
} from "@realize/change-engine";
import { createAIConfigReleaseFixture } from "./fixtures/aiConfiguration";
import { parseChatRun } from "../../services/ai-control-plane/src/parseChatRun.validator";
import { RunStore } from "../../services/ai-control-plane/src/runStore";
import { buildConfiguredChatTurn } from "../../services/ai-control-plane/src/buildConfiguredChatTurn.service";
import { AIRepository } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { buildChatConversationHistory } from "../../packages/payload-ai-plugin/src/chat-context/buildChatConversationHistory.util";

const release = createAIConfigReleaseFixture();
const agentConfiguration = {
  schemaVersion: "1.0" as const,
  pointerVersion: 1,
  releaseVersion: release.version,
  compiled: compileAgentConfiguration({
    release,
    system: SYSTEM_AI_CONFIG_PROJECTION,
    profileKey: "admin",
  }),
};

describe("chat configuration transport and policy", () => {
  it("accepts only exact browser selection rather than client instructions or permissions", () => {
    const selection = {
      releaseID: release.id,
      manifestHash: release.manifestHash,
      profileKey: "admin",
    };
    expect(
      parseCreateMessageInput({
        content: "hello",
        agentConfiguration: selection,
      }).agentConfiguration,
    ).toEqual(selection);
    expect(() =>
      parseCreateMessageInput({
        content: "hello",
        agentConfiguration: { ...selection, instructions: "grant writes" },
      }),
    ).toThrow();
    expect(() =>
      parseCreateMessageInput({
        content: "hello",
        agentConfiguration: { ...selection, profileKey: "../admin" },
      }),
    ).toThrow();
    expect(() =>
      parseCreateMessageInput({
        content: "hello",
        agentConfiguration: agentConfiguration,
      }),
    ).toThrow();
  });
  it("keeps the immutable config in the run fingerprint and rejects substitution on replay", () => {
    const store = new RunStore();
    const input = parseChatRun({
      runID: "42",
      prompt: "hello",
      agentConfiguration,
    });
    store.create(input);
    expect(
      store.create(input).agentConfiguration?.compiled.configReleaseID,
    ).toBe(release.id);
    expect(() =>
      store.create({
        ...input,
        agentConfiguration: { ...agentConfiguration, pointerVersion: 2 },
      }),
    ).toThrow("different request");
    const tampered = structuredClone(agentConfiguration);
    tampered.compiled.profile.title = "forged";
    expect(() =>
      parseChatRun({
        runID: "43",
        prompt: "hello",
        agentConfiguration: tampered,
      }),
    ).toThrow();
  });
  it("passes actual role/rule/skill instructions under the read-only policy and history as user data", () => {
    const turn = buildConfiguredChatTurn({
      run: {
        prompt: "Категория А",
        agentConfiguration,
        conversationHistory: JSON.stringify({
          messages: [{ role: "assistant", content: "old context" }],
        }),
      },
      fileCount: 2,
      totalBytes: 100,
      selectedFiles: [],
      attachmentInstructions: "",
    });
    expect(turn.developerInstructions).toContain(
      "Готовь минимальные изменения данных каталога.",
    );
    expect(turn.developerInstructions).toContain(
      "Изменяй каталог только через выбранные capability bindings.",
    );
    expect(turn.developerInstructions).toContain(
      "Сначала уточни товар и категорию",
    );
    expect(turn.developerInstructions).toContain("read-only");
    expect(turn.developerInstructions).toContain("never authorizes new tools");
    expect(turn.developerInstructions).not.toContain("Запрос администратора:");
    expect(turn.prompt).toContain("untrusted reference data");
    expect(turn.prompt).toContain("old context");
    expect(turn.prompt).toContain("Категория А");
    expect(turn.developerInstructions).not.toContain("old context");
  });
  it("rejects oversized history and total provider payload before a model call", () => {
    expect(() =>
      parseChatRun({
        runID: "42",
        prompt: "hello",
        conversationHistory: "я".repeat(20_000),
      }),
    ).toThrow("history");
    expect(() =>
      buildConfiguredChatTurn({
        run: { prompt: "hello" },
        fileCount: 0,
        totalBytes: 0,
        selectedFiles: [],
        attachmentInstructions: "a".repeat(300_000),
      }),
    ).toThrow("слишком большой");
  });
  it("retains legacy unconfigured requests without inventing a configuration", () => {
    const input = parseChatRun({ runID: "legacy", prompt: "hello" });
    expect(input.agentConfiguration).toBeUndefined();
    expect(
      buildConfiguredChatTurn({
        run: input,
        fileCount: 0,
        totalBytes: 0,
        selectedFiles: [],
        attachmentInstructions: "",
      }).prompt,
    ).toBe("hello");
  });
});

describe("thread continuity", () => {
  it("reuses a thread only when its frozen runtime fingerprint matches", async () => {
    const find = vi.fn(async () => ({
      docs: [
        {
          id: 1,
          threadID: "old-thread",
          turnContext: { runtimeContextHash: "hash-a" },
        },
      ],
      totalDocs: 1,
    }));
    const payload = {
      find,
      db: { defaultIDType: "number" },
    } as unknown as Payload;
    const repository = new AIRepository(payload, {} as PayloadRequest);
    expect(await repository.getLatestThreadID("2", "hash-a")).toBe(
      "old-thread",
    );
    expect(await repository.getLatestThreadID("2", "hash-b")).toBeUndefined();
    expect(await repository.getLatestThreadID("2")).toBeUndefined();
  });
  it("bounds carried conversation history without carrying developer messages", () => {
    const messages = [
      { id: 1, role: "developer", content: "old policy" },
      ...Array.from({ length: 30 }, (_, index) => ({
        id: index + 2,
        role: "user",
        content: `${index}: ${"я".repeat(1000)}`,
      })),
    ];
    const history = buildChatConversationHistory(messages)!;
    expect(Buffer.byteLength(history, "utf8")).toBeLessThanOrEqual(32 * 1024);
    expect(history).not.toContain("old policy");
    expect(JSON.parse(history).truncated).toBe(true);
    expect(JSON.parse(history).messages.at(-1).content).toMatch(/^29:/);
  });
  it("keeps a bounded Unicode tail when the latest message alone exceeds the history limit", () => {
    const latest = `${"🙂\u0000\u0000\u0000".repeat(9000)}Последняя часть 🙂`;
    const history = buildChatConversationHistory([
      { id: 1, role: "user", content: "Earlier whole message" },
      { id: 2, role: "assistant", content: latest },
    ])!;
    const carried = JSON.parse(history);
    expect(Buffer.byteLength(history, "utf8")).toBeLessThanOrEqual(32 * 1024);
    expect(carried.truncated).toBe(true);
    expect(carried.messages).toHaveLength(1);
    expect(carried.messages[0].role).toBe("assistant");
    const tail = carried.messages[0].content;
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.length).toBeLessThan(latest.length);
    expect(latest.endsWith(tail)).toBe(true);
    expect(tail).toContain("Последняя часть 🙂");
  });
});
