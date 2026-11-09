/**
 * @file .ai/tools/engineering/src/validateCodexAgent.validator.ts
 * @version 1.0.0
 * @date 2026-11-09
 * @description Проверяет ограниченный канонический TOML профиль custom agent.
 * @see documentation/specifications/agent-authoring.md
 */
import type { CodexAgentInput } from "./CodexAgent.types.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";

/** Поддерживается только вывод renderer; это не универсальный TOML parser. */
export function validateCodexAgent(source: string): CodexAgentInput {
  if (Buffer.byteLength(source) > 256 * 1024)
    throw new ProjectArtifactError(
      "LIMIT_EXCEEDED",
      "Слишком большой agent profile.",
    );
  const result: Record<string, string> = {};
  for (const line of source.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const match =
      /^(name|description|developer_instructions) = ("(?:[^"\\\r\n]|\\["\\bfnrt]|\\u[0-9a-fA-F]{4})*")$/.exec(
        line,
      );
    if (!match || Object.hasOwn(result, match[1]!))
      throw new ProjectArtifactError(
        "INVALID_INPUT",
        "Неподдержанный или повторный agent field.",
      );
    try {
      result[match[1]!] = JSON.parse(match[2]!);
    } catch {
      throw new ProjectArtifactError(
        "INVALID_INPUT",
        "Некорректная строка agent profile.",
      );
    }
  }
  if (
    Object.keys(result).length !== 3 ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(result.name ?? "") ||
    !result.description?.trim() ||
    !result.developer_instructions?.trim() ||
    Object.values(result).some((value) =>
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ud800-\udfff]/u.test(
        value,
      ),
    )
  )
    throw new ProjectArtifactError(
      "INVALID_INPUT",
      "Нужны корректные name, description и developer_instructions.",
    );
  return result as unknown as CodexAgentInput;
}
