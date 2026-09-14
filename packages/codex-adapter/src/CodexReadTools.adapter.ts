/**
 * @file packages/codex-adapter/src/CodexReadTools.adapter.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Ограничивает server-owned dynamic tools чтением в пределах одного turn Codex.
 */

import type { AgentReadTools } from "@realize/ai-contracts";
import { codexRecord } from "./codexRecord.util";
import type {
  CodexReadToolBinding,
  CodexReadToolResponse,
} from "./CodexReadTools.types";

const MAX_CALLS = 16;
const MAX_PARALLEL_CALLS = 4;
const MAX_ARGUMENT_BYTES = 16 * 1024;
const MAX_RESULT_BYTES = 128 * 1024;
const MAX_TOTAL_RESULT_BYTES = 512 * 1024;
const CALL_TIMEOUT_MS = 20_000;
const identifier = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 256 &&
  !/[\u0000-\u001f\u007f]/u.test(value);

/** Не расширяет sandbox: обработчик принадлежит серверу, а не аргументам run или модели. */
export class CodexReadTools {
  readonly definitions;
  private readonly names: Set<string>;
  private readonly execute: AgentReadTools["execute"];
  private readonly calls = new Set<string>();
  private readonly binding: Promise<CodexReadToolBinding | undefined>;
  private resolveBinding!: (value: CodexReadToolBinding | undefined) => void;
  private current?: CodexReadToolBinding;
  private closed = false;
  private inFlight = 0;
  private resultBytes = 0;

  constructor(tools: AgentReadTools) {
    if (
      !Array.isArray(tools.definitions) ||
      !tools.definitions.length ||
      tools.definitions.length > 8 ||
      typeof tools.execute !== "function"
    )
      throw new Error("codex_read_tools_invalid");
    const definitions = Array.from(tools.definitions, (definition) => {
      if (
        !definition ||
        typeof definition.name !== "string" ||
        !/^[a-z][a-z0-9_]{0,63}$/u.test(definition.name) ||
        typeof definition.description !== "string" ||
        !definition.description ||
        definition.description.length > 4_000 ||
        !codexRecord(definition.inputSchema)
      )
        throw new Error("codex_read_tools_invalid");
      return {
        type: "function" as const,
        name: definition.name,
        description: definition.description,
        inputSchema: definition.inputSchema,
      };
    });
    const serialized = JSON.stringify(definitions);
    if (Buffer.byteLength(serialized) > 32 * 1024)
      throw new Error("codex_read_tools_invalid");
    this.definitions = structuredClone(definitions);
    this.names = new Set(definitions.map(({ name }) => name));
    if (this.names.size !== definitions.length)
      throw new Error("codex_read_tools_invalid");
    this.execute = tools.execute;
    this.binding = new Promise((resolve) => {
      this.resolveBinding = resolve;
    });
  }

  /** Callback может прийти в одном JSONL chunk с turn/start: ждёт подтверждённые ID. */
  bind(threadID: string, turnID: string): void {
    if (
      this.closed ||
      this.current ||
      !identifier(threadID) ||
      !identifier(turnID)
    )
      throw new Error("codex_read_tools_binding_invalid");
    this.current = { threadID, turnID };
    this.resolveBinding(this.current);
  }

  close(): void {
    this.closed = true;
    this.resolveBinding(undefined);
  }

  /** UI получает только известный тип операции; raw arguments и contentItems не проецируются. */
  allowsItem(
    item: Record<string, unknown>,
    threadID: unknown,
    turnID: unknown,
  ): boolean {
    return (
      !this.closed &&
      Boolean(this.current) &&
      this.current?.threadID === threadID &&
      this.current?.turnID === turnID &&
      identifier(item.id) &&
      typeof item.tool === "string" &&
      this.names.has(item.tool) &&
      (item.namespace === undefined || item.namespace === null)
    );
  }

  /** Ошибки протокола выбрасываются для fail-closed RPC; ошибки сервиса возвращаются без raw деталей. */
  async handleRequest(
    method: string,
    value: unknown,
  ): Promise<CodexReadToolResponse> {
    const params = codexRecord(value);
    const args = params && JSON.stringify(params.arguments);
    if (
      method !== "item/tool/call" ||
      !params ||
      !identifier(params.callId) ||
      !identifier(params.threadId) ||
      !identifier(params.turnId) ||
      typeof params.tool !== "string" ||
      !this.names.has(params.tool) ||
      (params.namespace !== undefined && params.namespace !== null) ||
      !args ||
      Buffer.byteLength(args) > MAX_ARGUMENT_BYTES ||
      Object.keys(params).some(
        (key) =>
          ![
            "arguments",
            "callId",
            "threadId",
            "turnId",
            "tool",
            "namespace",
          ].includes(key),
      )
    )
      throw new Error("codex_read_tool_forbidden");
    const binding = await this.binding;
    if (
      this.closed ||
      binding?.threadID !== params.threadId ||
      binding?.turnID !== params.turnId ||
      this.calls.has(params.callId) ||
      this.calls.size >= MAX_CALLS ||
      this.inFlight >= MAX_PARALLEL_CALLS
    )
      throw new Error("codex_read_tool_forbidden");
    this.calls.add(params.callId);
    this.inFlight++;
    let timeout: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        this.execute({
          name: params.tool,
          arguments: JSON.parse(args),
          callID: params.callId,
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("codex_read_tool_timeout")),
            CALL_TIMEOUT_MS,
          );
        }),
      ]);
      const text = JSON.stringify(result);
      if (
        this.closed ||
        text === undefined ||
        Buffer.byteLength(text) > MAX_RESULT_BYTES ||
        this.resultBytes + Buffer.byteLength(text) > MAX_TOTAL_RESULT_BYTES
      )
        throw new Error("codex_read_tool_result_invalid");
      this.resultBytes += Buffer.byteLength(text);
      // Серверный отказ остаётся результатом вызова, но не считается успешным чтением в Codex/UI.
      return {
        success: codexRecord(result)?.ok !== false,
        contentItems: [{ type: "inputText", text }],
      };
    } catch {
      return {
        success: false,
        contentItems: [
          {
            type: "inputText",
            text: "Не удалось выполнить разрешённый запрос чтения. Уточните запрос или повторите позже.",
          },
        ],
      };
    } finally {
      clearTimeout(timeout);
      this.inFlight--;
    }
  }
}
