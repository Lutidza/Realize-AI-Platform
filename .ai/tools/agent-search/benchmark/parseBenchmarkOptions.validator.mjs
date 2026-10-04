/**
 * @file .ai/tools/agent-search/benchmark/parseBenchmarkOptions.validator.mjs
 * @version 1.0.0
 * @date 2026-09-30
 * @description Проверяет число повторов и явную отметку релиза без подстановки версии или cache state.
 * @see documentation/architecture/repository-search.md
 */
import { searchQualityRunSchema } from "../../../../packages/ai-contracts/src/searchQuality.schemas.ts";

/** initial означает первый замер процесса; OS cache не сбрасывается. */
export function parseBenchmarkOptions(args, allowNavigation = false) {
  const seen = new Set();
  const result = { runs: 1, release: "working-tree", navigation: false };
  for (const arg of args) {
    const [name, ...parts] = arg.split("=");
    const value = parts.join("=");
    if (seen.has(name)) throw new Error("Повтор benchmark option запрещён.");
    seen.add(name);
    if (name === "--runs" && /^[1-5]$/.test(value)) result.runs = Number(value);
    else if (name === "--release")
      result.release = searchQualityRunSchema.shape.release.parse(value);
    else if (arg === "--navigation" && allowNavigation)
      result.navigation = true;
    else
      throw new Error(
        "Допустимы --runs=1..5, --release=<отметка> и --navigation для navigation corpus.",
      );
  }
  return result;
}
