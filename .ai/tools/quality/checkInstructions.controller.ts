/**
 * @file .ai/tools/quality/checkInstructions.controller.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Печатает структурное evidence и блокирует CI при любом нарушении или неполном scan.
 */
import { checkInstructionGraph } from "./checkInstructionGraph.service";

try {
  if (process.argv.length !== 2)
    throw new Error("Arguments are not supported.");
  const report = await checkInstructionGraph(process.cwd());
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "passed" ? 0 : 1;
} catch {
  console.error("Instruction quality scan failed before completion.");
  process.exitCode = 1;
}
