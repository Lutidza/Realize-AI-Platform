/**
 * @file packages/ai-contracts/src/AiInstructions.types.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Выводит типы S1 из проверяемых входных и выходных контрактов.
 */
import type { z } from "zod";
import type { aiContextInputSchema } from "./aiInstructionInputs.config";
import type {
  aiContextOutputSchema,
  aiSourceSchema,
  aiCapabilitiesOutputSchema,
} from "./aiInstructionOutputs.config";

export type AiContextInput = z.output<typeof aiContextInputSchema>;
/** Метаданные источника не утверждают, что клиент получил или исполнил его текст. */
export type AiInstructionSourceDto = z.output<typeof aiSourceSchema>;
export type AiContextDto = z.output<typeof aiContextOutputSchema>;
export type AiCapabilitiesDto = z.output<typeof aiCapabilitiesOutputSchema>;
