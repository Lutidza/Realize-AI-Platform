/**
 * @file packages/payload-ai-plugin/src/admin/chat/getChatWorkflowRuns.util.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Выбирает последний доступный сегмент каждого процесса в истории диалога.
 */

import type { RunDTO } from "@realize/ai-contracts";

/** Дочерний запуск замещает родительский checkpoint независимо от порядка и равенства дат. */
export const getChatWorkflowRuns = (
  runs: readonly RunDTO[],
  currentRun?: RunDTO,
): RunDTO[] => {
  const all = [...runs.filter((run) => run.id !== currentRun?.id)];
  if (currentRun) all.push(currentRun);
  const parents = new Set(
    all.map((run) => run.workflow?.parentRunID).filter(Boolean),
  );
  const leaves = all
    .filter((run) => run.workflow && !parents.has(run.id))
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        (right.workflow?.version ?? 0) - (left.workflow?.version ?? 0),
    );
  // History может содержать только последние 100 run; root ID связывает разрывы списка.
  const roots = new Set<string>();
  return leaves.filter((run) => {
    const rootID =
      run.workflow?.rootRunID ?? run.workflow?.parentRunID ?? run.id;
    if (roots.has(rootID)) return false;
    roots.add(rootID);
    return true;
  });
};
