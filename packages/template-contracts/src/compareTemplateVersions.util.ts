/**
 * @file packages/template-contracts/src/compareTemplateVersions.util.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Сравнивает предварительно проверенные стабильные версии шаблонов.
 */

/** Внутренний comparator принимает только validated x.y.z без prerelease/build. */
export function compareTemplateVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }
  return 0;
}
