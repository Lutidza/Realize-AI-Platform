/**
 * @file scripts/runtime/evaluation/readEvaluationFingerprint.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Привязывает evidence к текущим исходникам через существующий release inventory reader.
 */
import { hashCanonicalJSON, SYSTEM_AI_RELEASE } from "@realize/change-engine";
import { checkInstructionGraph } from "../../../.ai/tools/quality/checkInstructionGraph.service";
import { readReleaseSourceFiles } from "../../release/readReleaseSourceFiles.adapter";

/** Полный scan обязателен: неполное чтение не становится hash корректного baseline. */
export async function readEvaluationFingerprint(root: string) {
  const structure = await checkInstructionGraph(root);
  if (structure.status !== "passed")
    throw new Error("EVAL_INSTRUCTION_STRUCTURE_INVALID");
  const runtime = await readReleaseSourceFiles({
    sourceRoot: root,
    paths: [
      "packages/codex-adapter",
      "packages/ai-contracts/src",
      "packages/change-engine/src",
      "packages/payload-ai-plugin/src/usage",
      "packages/payload-ai-plugin/src/integrations/codex/runtime",
      "packages/payload-ai-plugin/src/integrations/runtime",
      "services/ai-control-plane/src",
      "services/ai-execution-worker/src",
    ],
  });
  const harness = await readReleaseSourceFiles({
    sourceRoot: root,
    paths: [
      "scripts/runtime/evaluation",
      ".ai/tools/quality",
      "packages/ai-contracts/src/evaluation",
      "packages/change-engine/src/evaluation",
      "scripts/release/readReleaseSourceFiles.adapter.ts",
      "package.json",
      "package-lock.json",
    ],
  });
  return {
    systemReleaseId: SYSTEM_AI_RELEASE.releaseID,
    systemManifestHash: SYSTEM_AI_RELEASE.manifestHash,
    developmentSourceHash: structure.sourceHash,
    runtimeHash: hashCanonicalJSON(runtime),
    harnessHash: hashCanonicalJSON(harness),
    adapterVersion: `codex-${hashCanonicalJSON(runtime.filter((file) => file.path.startsWith("packages/codex-adapter/"))).slice(0, 24)}`,
  };
}
