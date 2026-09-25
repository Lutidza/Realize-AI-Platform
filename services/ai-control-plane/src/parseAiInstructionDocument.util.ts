/**
 * @file services/ai-control-plane/src/parseAiInstructionDocument.util.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Извлекает literal Markdown-ссылки и advisory metadata без исполнения YAML или prose.
 */
import { posix } from "node:path";
import type { AiInstructionDocument } from "./AiInstructionSource.types";
import { classifyAiInstructionSource } from "./aiInstructionPolicy.validator";
import { parseRepositoryPath } from "./repositoryReadPolicy.validator";
import { AI_INSTRUCTION_LIMITS } from "./aiInstructionSources.config";

/** Это ограниченный extractor ссылок, а не интерпретатор применимости правил. */
export function parseAiInstructionDocument(
  path: string,
  text: string,
): AiInstructionDocument {
  const metadata =
    text.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ??
    text.match(/```ya?ml[^\n]*\n([\s\S]*?)\n```/u)?.[1] ??
    "";
  const artifactId =
    metadata.match(
      /^(?:artifact_id|rule_id|check_id):\s*["']?([\w.-]{1,256})["']?\s*$/mu,
    )?.[1] ?? null;
  const inactive =
    /^status:\s*["']?(?:archived|retired|deprecated|superseded|draft)["']?\s*$/mu.test(
      metadata,
    );
  const references = new Set<string>();
  let omitted = 0;
  const add = (candidate: string, relative: boolean) => {
    const clean = candidate.split("#")[0];
    if (!clean || /^[a-z]+:|^\//iu.test(clean)) return;
    const resolved = relative
      ? posix.normalize(posix.join(posix.dirname(path), clean))
      : clean;
    try {
      parseRepositoryPath(resolved);
    } catch {
      omitted++;
      return;
    }
    if (!classifyAiInstructionSource(resolved)) {
      omitted++;
      return;
    }
    if (resolved !== path) references.add(resolved);
  };
  for (const match of text.matchAll(
    /\[[^\]\n]*\]\(<?([^\s)>]+)>?(?:\s+[^)]*)?\)/gu,
  ))
    add(match[1], true);
  for (const match of text.matchAll(
    /(?:^|[\s`"'(\[,])((?:\.ai|\.codex|documentation)\/[\w./-]+\.md)(?=$|[\s`"')\],#.:])/gmu,
  ))
    add(match[1], false);
  const sorted = [...references].sort();
  return {
    artifactId,
    inactive,
    references: sorted.slice(0, AI_INSTRUCTION_LIMITS.maxReferences),
    referencesOmitted:
      omitted +
      Math.max(0, sorted.length - AI_INSTRUCTION_LIMITS.maxReferences),
  };
}
