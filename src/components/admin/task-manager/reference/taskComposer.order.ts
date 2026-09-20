/**
 * @file src/components/admin/task-manager/reference/taskComposer.order.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Переставляет элементы черновика без изменения исходного массива.
 */

export function moveDraftItem<T>(
  items: T[],
  index: number,
  direction: -1 | 1,
): T[] {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
