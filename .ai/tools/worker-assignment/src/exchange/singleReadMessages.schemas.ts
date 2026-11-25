/**
 * @file .ai/tools/worker-assignment/src/exchange/singleReadMessages.schemas.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Проверяет сообщения последовательных чтений, вызов функции и финальный ответ аудита.
 * @see documentation/architecture/assignment-adapter/single-read.md
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import { z } from "zod";

const user = z.strictObject({ role: z.literal("user"), content: z.string() });
const assistant = z.strictObject({
  role: z.literal("assistant"),
  content: z.string().nullable().optional(),
  tool_calls: z.tuple([
    z.strictObject({
      id: z.string().min(1),
      type: z.literal("function"),
      function: z.strictObject({
        name: z.string().min(1),
        arguments: z.string(),
      }),
    }),
  ]),
});
const tool = z.strictObject({
  role: z.literal("tool"),
  tool_call_id: z.string().min(1),
  content: z.string(),
});
/** За единственным исходным вводом следуют только завершённые пары assistant/tool. */
export const auditMessagesSchema = z
  .tuple([user])
  .rest(z.discriminatedUnion("role", [assistant, tool]))
  .refine(
    (messages) =>
      messages.length % 2 === 1 &&
      messages
        .slice(1)
        .every(
          (message, index) =>
            message.role === (index % 2 === 0 ? "assistant" : "tool"),
        ),
  );

/** Поля внешней оболочки ответа не попадают в историю сообщений Realize. */
export const callResponseSchema = z.object({
  choices: z.tuple([
    z.object({
      finish_reason: z.literal("tool_calls"),
      message: assistant,
    }),
  ]),
});
export const reportResponseSchema = z.object({
  choices: z.tuple([
    z.object({
      finish_reason: z.literal("stop"),
      message: z.object({
        role: z.literal("assistant"),
        content: z.string().refine((content) => content.trim().length > 0),
        tool_calls: z.undefined().optional(),
        function_call: z.null().optional(),
        refusal: z.null().optional(),
      }),
    }),
  ]),
});
export type AuditAssistantCall = z.infer<typeof assistant>;
