/**
 * @file .ai/tools/worker-assignment/src/surveyAuditInventory.service.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Распределяет полный инвентарь путей штатного поиска для выявления кандидатов без прежних названий.
 * @see documentation/specifications/internal-mcp.md
 */
import type { RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { planTextAssignment } from "./planTextAssignment.service";
import { executeIsolatedIdeAudit } from "./adapters/executeIsolatedIdeAudit.adapter";
import { hashAuditText } from "./checkpoints/hashAuditText.util";
import type { AuditExpansion } from "./auditExpansion.service";

/** Пакеты метаданных ограничены байтами, все пути каждой области присутствуют ровно один раз. */
export function inventoryPackets(
  areas: Map<string, string[]>,
  budget = 28 * 1024,
) {
  const packets: { area: string; paths: string[] }[] = [];
  for (const [area, paths] of areas) {
    let group: string[] = [],
      bytes = 0;
    for (const path of paths) {
      const size = Buffer.byteLength(JSON.stringify(path)) + 1;
      if (group.length && bytes + size > budget) {
        packets.push({ area, paths: group });
        group = [];
        bytes = 0;
      }
      group.push(path);
      bytes += size;
    }
    if (group.length) packets.push({ area, paths: group });
  }
  return packets;
}

export async function surveyAuditInventory(options: {
  policy: RepositoryReadPolicy;
  runId: string;
  mission: string;
  expansion: AuditExpansion;
  signal: AbortSignal;
  anchor: string;
  renew: () => void;
  record: (data: unknown) => void;
  evidence: Record<string, string[]>;
}) {
  const { expansion, signal } = options;
  const packets = inventoryPackets(expansion.areas),
    selected = new Set<string>();
  let cursor = 0;
  async function survey() {
    while (cursor < packets.length) {
      signal.throwIfAborted();
      options.renew();
      const index = cursor++,
        { area, paths } = packets[index];
      const assignmentId = options.runId + ".inventory." + (index + 1);
      const payload = JSON.stringify({ area, paths });
      const bound = await planTextAssignment(
        options.policy,
        assignmentId,
        (
          "Отбери адресные источники из путей штатного поиска. Предмет: " +
          options.mission
        ).slice(0, 2048),
        [options.anchor],
        "Метаданные поискового профиля: " + area,
        expansion.scope.files.keys(),
        "inventory",
      );
      const result = await executeIsolatedIdeAudit(
        bound,
        signal,
        {},
        [],
        payload,
        () =>
          options.record({
            phase: "inventory-delivery",
            assignmentId,
            area,
            paths,
            sha256: hashAuditText(payload),
          }),
        "inventory",
      );
      if (!result.inventory)
        throw new Error("assignment_inventory_review: " + area);
      const candidates = new Set<string>();
      for (const candidate of result.inventory.candidates) {
        if (!paths.includes(candidate.path)) continue;
        selected.add(candidate.path);
        candidates.add(candidate.path);
        (options.evidence[candidate.path] ??= []).push(
          candidate.path +
            " — гипотеза для проверки: " +
            candidate.hypothesis.slice(0, 500),
        );
      }
      // Неуверенный отбор по имени передаёт содержимое исполнителю; файлы не выпадают из области.
      if (result.status !== "completed")
        for (const path of paths) {
          selected.add(path);
          candidates.add(path);
        }
      const parts = expansion.surveyed.get(area) ?? [];
      parts.push({
        paths: paths.length,
        candidates: [...candidates],
        basis: result.inventory.basis,
      });
      expansion.surveyed.set(area, parts);
      options.record({
        phase: "inventory-review",
        status: result.status,
        assignmentId,
        area,
        count: paths.length,
        candidates: [...candidates],
        basis: result.inventory.basis,
      });
    }
  }
  const tasks = await Promise.allSettled(
    Array.from({ length: Math.min(3, packets.length) }, survey),
  );
  for (const task of tasks) if (task.status === "rejected") throw task.reason;
  return selected;
}
