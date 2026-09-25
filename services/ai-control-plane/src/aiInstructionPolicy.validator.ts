/**
 * @file services/ai-control-plane/src/aiInstructionPolicy.validator.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Ограничивает источники S1 статическими инструкциями и справочными документами.
 * @see documentation/specifications/internal-mcp.md
 */
import type { RepositoryReadPolicy } from "./RepositoryRead.types";
import type { AiInstructionClassification } from "./AiInstructionSource.types";
import { isRepositoryPathAllowed } from "./repositoryReadPolicy.validator";
import { RepositoryReadError } from "./RepositoryRead.error";

/** Authority следует пути, не словам «system» или «admin» внутри документа. */
export function classifyAiInstructionSource(
  path: string,
): AiInstructionClassification | null {
  if (!path.endsWith(".md") || /^documentation\/(?:temp|reports)\//u.test(path))
    return null;
  if (path === "AGENTS.md" || path.endsWith("/AGENTS.md"))
    return { authority: "project", category: "agents" };
  for (const [prefix, category] of [
    [".ai/registry/", "registry"],
    [".ai/rules/", "rule"],
    [".ai/checks/", "check"],
    [".ai/workflows/", "workflow"],
    [".ai/roles/", "role"],
    [".ai/system/", "rule"],
  ] as const) {
    if (path.startsWith(prefix)) return { authority: "policy", category };
  }
  if (path.startsWith(".codex/skills/"))
    return { authority: "procedure", category: "skill" };
  if (path.startsWith(".codex/prompts/") || path.startsWith(".codex/agents/"))
    return { authority: "procedure", category: "reference" };
  if (
    [
      "README.md",
      ".ai/README.md",
      ".ai/STRUCTURE.md",
      ".codex/README.md",
      ".codex/STRUCTURE.md",
    ].includes(path) ||
    (path.startsWith("documentation/") &&
      !/^documentation\/(?:temp|reports)\//u.test(path))
  )
    return { authority: "reference", category: "reference" };
  return null;
}

/** Проверка выполняется до stat/read и не раскрывает существование закрытого пути. */
export function validateAiInstructionPath(
  policy: RepositoryReadPolicy,
  path: string,
): AiInstructionClassification {
  const classification = classifyAiInstructionSource(path);
  if (
    !policy.developerInstructions ||
    !classification ||
    !isRepositoryPathAllowed(policy, path)
  )
    throw new RepositoryReadError(
      "FORBIDDEN",
      "Источник недоступен политике инструкций.",
    );
  return classification;
}
