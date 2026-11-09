/**
 * @file .ai/tools/engineering/src/renderCodexAgent.util.ts
 * @version 1.0.0
 * @date 2026-11-09
 * @description Формирует воспроизводимый TOML custom agent без filesystem effects.
 * @see documentation/specifications/agent-authoring.md
 */
import type { CodexAgentInput } from "./CodexAgent.types.ts";
import { validateCodexAgent } from "./validateCodexAgent.validator.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";

/** Неизвестные поля отклоняются; read-only обязан обеспечить parent runtime. */
export function renderCodexAgent(input: CodexAgentInput): Uint8Array {
  const keys = ["name", "description", "developer_instructions"] as const;
  if (
    !input ||
    Object.keys(input).length !== keys.length ||
    keys.some((key) => typeof input[key] !== "string")
  )
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Неизвестный или неполный agent input.",
    );
  const text =
    keys.map((key) => `${key} = ${JSON.stringify(input[key])}`).join("\n") +
    "\n";
  validateCodexAgent(text);
  return new TextEncoder().encode(text);
}
