/**
 * @file services/ai-control-plane/src/resolveAiContext.service.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Собирает ограниченный граф источников S1 с provenance, hash и явным неполным coverage.
 * @see documentation/specifications/internal-mcp.md
 */
import { posix } from "node:path";
import type {
  AiContextDto,
  AiContextInput,
} from "../../../packages/ai-contracts/src/AiInstructions.types";
import { aiContextInputSchema } from "../../../packages/ai-contracts/src/aiInstructionInputs.config";
import type { AiInstructionCandidate } from "./AiInstructionSource.types";
import type { RepositoryQueryContext } from "./RepositoryQueries.types";
import {
  AI_INSTRUCTION_CORE,
  AI_INSTRUCTION_LIMITS,
  AI_INSTRUCTION_PROFILES,
} from "./aiInstructionSources.config";
import { validateAiInstructionPath } from "./aiInstructionPolicy.validator";
import { parseAiInstructionDocument } from "./parseAiInstructionDocument.util";
import {
  assertRepositoryReadActive,
  readRepositoryFile,
} from "./readRepositoryFile.service";
import {
  isRepositoryPathAllowed,
  parseRepositoryPath,
} from "./repositoryReadPolicy.validator";
import { RepositoryReadError } from "./RepositoryRead.error";
import { hashRepositorySnapshot } from "./RepositoryCursor.service";

function candidatesFor(input: AiContextInput): AiInstructionCandidate[] {
  const queue: AiInstructionCandidate[] = AI_INSTRUCTION_CORE.map((path) => ({
    path,
    from: null,
    depth: 0,
    selection: "core",
  }));
  const kinds = new Set<AiContextInput["kind"]>([input.kind]);
  for (const path of input.targetPaths) {
    if (/^(?:\.ai|\.codex)\//u.test(path)) kinds.add("system");
    if (/^(?:documentation\/|README\.md$)/u.test(path))
      kinds.add("documentation");
    if (
      /^(?:services\/|packages\/ai-|src\/(?:collections|migrations|plugins|utilities)\/)|\/api\//u.test(
        path,
      )
    )
      kinds.add("backend");
    if (/\.[jt]sx$|\.(?:css|scss)$|^src\/(?:components|app)\//u.test(path))
      kinds.add("frontend");
  }
  for (const kind of kinds)
    for (const path of AI_INSTRUCTION_PROFILES[kind])
      queue.push({ path, from: null, depth: 0, selection: "profile" });
  for (const path of input.entrypoints)
    queue.push({ path, from: null, depth: 0, selection: "requested" });
  for (const target of input.targetPaths) {
    // Проверяются все возможные directory ancestors, включая ещё не созданный target.
    const parts = target.split("/");
    for (let count = 1; count <= parts.length; count++) {
      const directory = parts.slice(0, count).join("/");
      if (count === parts.length && posix.extname(directory)) break;
      queue.push({
        path: `${directory}/AGENTS.md`,
        from: "AGENTS.md",
        depth: 0,
        selection: "target",
        optional: true,
      });
    }
  }
  return queue;
}

/** Hash относится только к просмотренным источникам; prose applicability требует review. */
export async function resolveAiContext(
  context: RepositoryQueryContext,
  unparsed: AiContextInput,
): Promise<AiContextDto> {
  const input = aiContextInputSchema.parse(unparsed);
  validateAiInstructionPath(context.policy, "AGENTS.md");
  for (const path of input.targetPaths) {
    parseRepositoryPath(path);
    if (
      !isRepositoryPathAllowed(context.policy, path) ||
      path.split("/").length > 24
    )
      throw new RepositoryReadError(
        "FORBIDDEN",
        "Область задачи недоступна политике чтения.",
      );
  }
  for (const path of input.entrypoints)
    validateAiInstructionPath(context.policy, path);
  const queue = candidatesFor(input);
  const roots = new Set(queue.map((candidate) => candidate.path));
  const seen = new Set<string>();
  const deferred = new Set<string>();
  const sources: AiContextDto["sources"] = [];
  const issues: AiContextDto["issues"] = [
    { code: "prose_review_required", paths: ["AGENTS.md"] },
  ];
  const identifiers = new Map<string, string>();
  const fingerprints: Array<[string, string]> = [];
  let bytesRead = 0;
  let referencesOmitted = 0;
  let truncated = false;
  for (let index = 0; index < queue.length; index++) {
    assertRepositoryReadActive(context.signal);
    const candidate = queue[index];
    if (seen.has(candidate.path)) continue;
    if (
      seen.size >= input.maxSources ||
      bytesRead >= AI_INSTRUCTION_LIMITS.maxTotalBytes
    ) {
      deferred.add(candidate.path);
      truncated = true;
      continue;
    }
    seen.add(candidate.path);
    let classification;
    let file;
    try {
      classification = validateAiInstructionPath(
        context.policy,
        candidate.path,
      );
      file = await readRepositoryFile(context.policy, candidate.path, {
        signal: context.signal,
        maximumBytes: Math.min(
          AI_INSTRUCTION_LIMITS.maxSourceBytes,
          AI_INSTRUCTION_LIMITS.maxTotalBytes - bytesRead,
        ),
      });
      bytesRead += file.bytes.length;
    } catch (error) {
      const code =
        error instanceof RepositoryReadError
          ? error.code
          : (error as NodeJS.ErrnoException).code;
      if (code === "TIMEOUT" || context.signal?.aborted) throw error;
      if (code === "RESULT_LIMIT") {
        deferred.add(candidate.path);
        truncated = true;
        issues.push({ code: "source_limit", paths: [candidate.path] });
        fingerprints.push([candidate.path, "source_limit"]);
        continue;
      }
      const missing = code === "NOT_FOUND" || code === "ENOENT";
      if (!candidate.optional || !missing)
        issues.push({
          code: missing ? "missing_source" : "unavailable_source",
          paths: [candidate.path],
        });
      fingerprints.push([candidate.path, missing ? "absent" : "unavailable"]);
      continue;
    }
    fingerprints.push([candidate.path, file.sha256]);
    const document = parseAiInstructionDocument(candidate.path, file.text);
    referencesOmitted += document.referencesOmitted;
    if (document.inactive)
      issues.push({ code: "inactive_source", paths: [candidate.path] });
    if (document.artifactId) {
      const previous = identifiers.get(document.artifactId);
      if (previous)
        issues.push({
          code: "duplicate_artifact_id",
          paths: [previous, candidate.path],
        });
      else identifiers.set(document.artifactId, candidate.path);
    }
    sources.push({
      path: candidate.path,
      sha256: file.sha256,
      byteLength: file.bytes.length,
      artifactId: document.artifactId,
      ...classification,
      discoveredFrom: candidate.from,
      selection: candidate.selection,
      applicability: "needs_review",
      contentDelivered: false,
    });
    for (const reference of document.references) {
      if (!isRepositoryPathAllowed(context.policy, reference)) {
        referencesOmitted++;
        continue;
      }
      // Навигация AGENTS/registry указывает и на чужие профили: не объявляем их неприменимыми.
      const selected = roots.has(reference);
      if (
        (!selected &&
          (classification.category === "agents" ||
            reference.startsWith(".ai/registry/"))) ||
        candidate.depth >= AI_INSTRUCTION_LIMITS.maxDepth
      ) {
        deferred.add(reference);
        continue;
      }
      if (queue.length >= 512) {
        deferred.add(reference);
        truncated = true;
        continue;
      }
      queue.push({
        path: reference,
        from: candidate.path,
        depth: candidate.depth + 1,
        selection: "reference",
      });
    }
  }
  const pending = [...deferred]
    .filter((path) => !sources.some((source) => source.path === path))
    .sort();
  referencesOmitted +=
    Math.max(0, pending.length - 128) + Math.max(0, issues.length - 128);
  return {
    resolverVersion: "1.0",
    status: "needs_review",
    policyHash: hashRepositorySnapshot({
      resolver: "1.0",
      policy: context.policy.version,
      fingerprints: fingerprints.sort(),
      deferred: pending,
    }),
    observedAt: new Date().toISOString(),
    sources,
    issues: issues.slice(0, 128),
    deferredReferences: pending.slice(0, 128),
    coverage: {
      sourcesRead: sources.length,
      bytesRead,
      truncated: truncated || pending.length > 0 || referencesOmitted > 0,
      referencesOmitted,
      completeBootstrap: false,
      semantics: "human_review_required",
    },
    fallback: "read_same_sources_directly",
  };
}
