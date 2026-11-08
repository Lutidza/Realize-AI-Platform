/**
 * @file .ai/tools/agent-search/src/runImportReadSteps.service.mjs
 * @version 1.0.0
 * @date 2026-10-29
 * @description Выполняет общий алгоритм resolution с синхронным либо асинхронным reader без второго resolver.
 * @see documentation/architecture/repository-search.md
 */

/** В synchronous режиме Promise запрещён до продолжения алгоритма. */
export function runImportReadSteps(steps, synchronous = false) {
  function advance(value) {
    let next = steps.next(value);
    while (!next.done) {
      if (next.value && typeof next.value.then === "function") {
        if (synchronous)
          throw new TypeError("Synchronous import reader returned a Promise.");
        return Promise.resolve(next.value).then(advance);
      }
      next = steps.next(next.value);
    }
    return next.value;
  }
  return advance();
}
