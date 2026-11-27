/**
 * @file .ai/tools/worker-assignment/src/runTextAudit.service.ts
 * @version 1.2.0
 * @date 2026-11-26
 * @description Выдаёт закреплённые диапазоны, проверяет покрытие и продолжает исследование до закрытия областей и запросов.
 * @see documentation/specifications/internal-mcp.md
 */
import { type RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import type {
  IdeAuditDelivery,
  IdeAuditRange,
  PriorAuditMaterial,
} from "realize-ai-platform/ide-assignment-queue";
import { discoverAssignmentSources } from "./discoverAssignmentSources.service";
import { planTextAssignment } from "./planTextAssignment.service";
import { executeIsolatedIdeAudit } from "./adapters/executeIsolatedIdeAudit.adapter";
import { verifyAuditDeliveries } from "./auditRanges.service";
import {
  type AuditLookup,
  expansiveAudit,
  inventoryAuditScope,
} from "./auditSearchScope.service";
import { batchAuditSources } from "./batchAuditSources.service";
import {
  evaluateAuditCoverage,
  optionalAuditFocus,
} from "./evaluateAuditCoverage.service";
import { expandAuditLookups } from "./expandAuditLookups.service";
import { AuditExpansion } from "./auditExpansion.service";
import { revalidateAuditMaterial } from "./revalidateAuditMaterial.service";
import { surveyAuditInventory } from "./surveyAuditInventory.service";

type Journal = {
  record: (delivery: IdeAuditDelivery) => void;
  read: () => IdeAuditDelivery[];
  priorPaths: () => string[];
  archive: () => PriorAuditMaterial | undefined;
  search: (step: number, evidence: unknown) => void;
};

/** Сохраняет машинную квитанцию целиком при лимите текста публичного отчёта. */
function withReceipt(report: string, receipt: string) {
  const budget = 32768 - Buffer.byteLength(receipt) - 64;
  const data = Buffer.from(report);
  return (
    (data.length > budget
      ? data.subarray(0, Math.max(0, budget)).toString("utf8") +
        "… [отчёт сокращён]"
      : report) +
    "\n\n" +
    receipt
  );
}

export async function runTextAudit(
  policy: RepositoryReadPolicy,
  runId: string,
  mission: string,
  signal: AbortSignal,
  renew: () => void,
  journal: Journal,
) {
  const broad = expansiveAudit(mission);
  const explicit = [
    ...new Set(
      mission.match(/(?:[\p{L}\d_.@()-]+\/)*[\w@-]+(?:\.[\w-]+)+/gu) ?? [],
    ),
  ];
  const initial =
    !broad && !explicit.length
      ? await discoverAssignmentSources(policy.root, mission, signal, true)
      : undefined;
  const adaptive = broad || (initial !== undefined && !initial.paths.length);
  const inventory = adaptive
    ? await inventoryAuditScope(policy, mission, signal)
    : undefined;
  if (inventory && !inventory.files.size)
    throw new Error("assignment_search_failed: пустой инвентарь профилей");
  const expansion = inventory
    ? new AuditExpansion(inventory, mission)
    : undefined;
  const selection =
    explicit.length && !adaptive
      ? {
          paths: explicit,
          evidence: {} as Record<string, string[]>,
          coverage: "Явно указанные источники.",
          terms: [] as string[],
        }
      : (!adaptive && initial) ||
        (await discoverAssignmentSources(
          policy.root,
          mission,
          signal,
          adaptive,
          inventory?.profiles,
        ));
  let pending = new Set(
    [...selection.paths, ...explicit].filter(
      (p) => !inventory || inventory.files.has(p),
    ),
  );
  if (expansion) {
    // Предыдущая попытка предлагает только адреса. Каждое доказательство привязывается и читается заново.
    for (const path of journal.priorPaths())
      if (expansion.scope.files.has(path)) pending.add(path);
    for (const path of expansion.scope.files.keys())
      if (
        selection.terms.some((term) =>
          path.toLowerCase().includes(term.toLowerCase()),
        )
      )
        pending.add(path);
    if (!pending.size) pending = new Set(expansion.fallback(true, 1));
  }
  const seen = expansion?.seen ?? new Set<string>();
  const plan: IdeAuditDelivery[] = [];
  const windowPlan: IdeAuditDelivery[] = [];
  const gaps: string[] = [];
  const inaccessible: string[] = [];
  const completedRanges = new Map<string, number>();
  const reports: string[] = [];
  const focused = new Set<string>();
  let completed = 0,
    round = 0,
    step = 0,
    withoutLeads = 0;
  let previous = "",
    proof = "";
  let anchor: IdeAuditRange | undefined;
  const searchLog = (value: unknown) => {
    journal.search(++step, value);
    return step;
  };
  function investigate(fresh: AuditLookup[], allRanges: IdeAuditRange[]) {
    return expandAuditLookups({
      policy,
      runId,
      round,
      mission,
      signal,
      renew,
      expansion: expansion!,
      fresh,
      allRanges,
      searchLog,
      notesByPath: selection.evidence,
      delivery: (expected, actual) => {
        journal.record(actual);
        windowPlan.push(expected);
      },
    });
  }
  let archivedFiles = 0;
  if (expansion) {
    searchLog({
      phase: "inventory",
      areas: expansion.describe(),
      excluded: inventory!.excluded,
      initial: pending.size,
      search: selection.coverage,
    });
    const source = [...pending][0];
    if (source) {
      const candidates = await surveyAuditInventory({
        policy,
        runId,
        mission,
        expansion,
        signal,
        anchor: source,
        renew,
        record: searchLog,
        evidence: selection.evidence,
      });
      for (const p of candidates) pending.add(p);
    }
    const followups: AuditLookup[] = selection.terms.map((value) => ({
      kind: "text",
      scope: "*",
      source: "",
      line: 0,
      value,
    }));
    const archive = journal.archive();
    if (archive) {
      const restored = await revalidateAuditMaterial(
        policy,
        expansion,
        archive,
        signal,
        searchLog,
      );
      archivedFiles = expansion.reviewed.size;
      anchor = restored.anchor;
      reports.push(...restored.reports);
      previous =
        "Проверить заново открытые вопросы предыдущей аренды в актуальном инвентаре. " +
        restored.open +
        "\nПредыдущие предметные решения для новой приёмки, их источники повторно сверены: " +
        JSON.stringify(restored.earlier);
      for (const p of restored.changed)
        if (expansion.scope.files.has(p)) pending.add(p);
      followups.push(
        ...restored.consumers,
        ...expansion.definitionRequests(restored.open),
      );
    }
    const extra = await investigate(expansion.pendingRequests(followups), []);
    for (const p of extra) pending.add(p);
  }
  function finish(status: "completed" | "blocked", report: string) {
    const summary = expansion
      ? ` Итераций проверки ${round}; уточняющих запросов ${expansion.queries.size}; заявленные области задания ${[...expansion.objectives.values()].filter((g) => g.checked).length}/${expansion.objectives.size}; из них с внешним остатком ${[...expansion.objectives.values()].filter((g) => !g.checked && g.outside).length}; рассмотрено имён в инвентаре ${expansion.describe().reduce((n, a) => n + a.surveyedPaths, 0)}; проверки потребителей ${[...expansion.consumers.values()].filter((c) => c.checked).length}/${expansion.consumers.size}. Области (проверено файлов / инвентарь): ${expansion
          .describe()
          .map((a) => a.area + " " + a.reviewed + "/" + a.inventory)
          .join(
            ", ",
          )}. Исключено политикой чтения из выдачи профилей: ${expansion.scope.excluded}.`
      : "";
    return {
      status: inaccessible.length ? ("blocked" as const) : status,
      report: withReceipt(
        [report, ...inaccessible].join("\n"),
        [
          selection.coverage.slice(0, 1500),
          proof,
          `Проверок Assignment ${completed}/${plan.length}; проблем выдачи или исполнения ${gaps.length}.`,
          summary,
        ].join(" "),
      ),
    };
  }
  async function bind(
    group: IdeAuditRange[],
    id: string,
    task: string,
    purpose: "review" | "coverage" | "passage" = "review",
  ) {
    const bound = await planTextAssignment(
      policy,
      id,
      task.slice(0, 2048),
      group.map((s) => s.path),
      selection.coverage.slice(0, 1800),
      seen,
      purpose,
    );
    if (
      !bound.context ||
      group.some((s) => bound.context.readPins[s.path] !== s.fileSha256)
    )
      throw new Error(
        "assignment_read: недоступен закреплённый снимок " +
          group.map((s) => s.path).join(", "),
      );
    return bound;
  }
  while (true) {
    signal.throwIfAborted();
    renew();
    round++;
    const paths = [...pending].filter((path) => !seen.has(path));
    paths.forEach((p) => seen.add(p));
    pending = new Set();
    const groups = await batchAuditSources(policy, paths, inaccessible, signal);
    const wave = groups.map((ranges) => {
      const delivery = {
        assignmentId: runId + "." + (plan.length + 1),
        ranges,
      };
      plan.push(delivery);
      return delivery;
    });
    if (expansion)
      searchLog({
        phase: "review",
        round,
        assignments: wave.map((w) => w.assignmentId),
        paths,
      });
    // Исполнители одной итерации получают независимые привязки. Следующая итерация ждёт всю группу.
    let next = 0;
    const results = Array<string>(wave.length);
    async function review() {
      while (next < wave.length) {
        const index = next++,
          { assignmentId: id, ranges: group } = wave[index];
        signal.throwIfAborted();
        renew();
        const scope = group
          .map((s) => s.path + ":" + s.startLine + "–" + s.endLine)
          .join(", ");
        console.log(
          JSON.stringify({
            runId,
            round,
            assignmentId: id,
            phase: "review",
            scope,
          }),
        );
        try {
          const task =
            adaptive || wave.length > 1
              ? "Проверь свой диапазон. Укажи только относящиеся к предмету факты, доказательства файл:строка, точные имена объявлений и их потребителей для дальнейшего поиска. При отсутствии следов сообщи границы отрицательной проверки. Проверка всего репозитория принадлежит оркестратору. Предмет: " +
                mission
              : mission;
          const bound = await bind(
            group,
            id,
            task,
            adaptive ? "passage" : "review",
          );
          const result = await executeIsolatedIdeAudit(
            bound,
            signal,
            Object.fromEntries(
              group.map((s) => [s.path, [s.startLine, s.endLine]]),
            ),
            undefined,
            group.flatMap((s) => selection.evidence[s.path] ?? []).join("\n"),
            (ranges) => journal.record({ assignmentId: id, ranges }),
          );
          results[index] =
            id + " [" + scope + "] " + result.status + "\n" + result.report;
          if (expansion)
            searchLog({
              phase: "source-review",
              round,
              assignmentId: id,
              status: result.status,
              report: result.report,
            });
          if (result.status === "completed") {
            completed++;
            anchor ??= group[0];
            for (const s of group)
              completedRanges.set(
                s.path,
                (completedRanges.get(s.path) ?? 0) + 1,
              );
          } else {
            anchor ??= group[0];
            if (expansion)
              for (const r of group)
                expansion.localQuestions.set(
                  r.path,
                  id + ": " + result.report.slice(0, 500),
                );
          }
        } catch (error) {
          signal.throwIfAborted();
          gaps.push(scope + ": " + String(error));
        }
      }
    }
    const reviews = await Promise.allSettled(
      Array.from({ length: Math.min(adaptive ? 3 : 1, wave.length) }, review),
    );
    for (const result of reviews)
      if (result.status === "rejected") throw result.reason;
    reports.push(...results.filter(Boolean));
    const receipts = journal.read();
    const isWindow = (d: IdeAuditDelivery) =>
      d.assignmentId.startsWith(runId + ".lookup.");
    const proofData = verifyAuditDeliveries(
      plan,
      receipts.filter((d) => !isWindow(d)),
    );
    const windowProof = verifyAuditDeliveries(
      windowPlan,
      receipts.filter(isWindow),
      "search-windows",
    );
    proofData.errors.push(...windowProof.errors);
    const allRanges = plan.flatMap((d) => d.ranges);
    proof = `Доставка по SHA-256: ${proofData.verifiedRanges}/${allRanges.length} диапазонов, смежное покрытие до EOF у ${proofData.completeFiles}/${new Set(allRanges.map((r) => r.path)).size} выбранных файлов новой аренды. Повторно сверено ранее прочитанных файлов ${archivedFiles}. Поисковых окон ${windowProof.verifiedRanges}, отдельных Assignment по совпадениям ${windowPlan.length}.`;
    if (!anchor && expansion && !proofData.errors.length && !gaps.length) {
      pending = new Set(expansion.fallback(true, 2));
      if (pending.size) continue;
    }
    if (proofData.errors.length || !anchor || gaps.length)
      return finish(
        "blocked",
        [previous, ...proofData.errors, ...gaps, ...inaccessible, ...reports]
          .filter(Boolean)
          .join("\n"),
      );
    if (!adaptive && plan.length === 1)
      return finish(completed ? "completed" : "blocked", reports[0]);
    if (expansion) {
      const counts = new Map<string, number>();
      for (const s of allRanges)
        counts.set(s.path, (counts.get(s.path) ?? 0) + 1);
      for (const s of allRanges)
        if (completedRanges.get(s.path) === counts.get(s.path))
          expansion.reviewed.set(s.path, s.totalLines);
    }
    try {
      renew();
      const recent = expansion?.acceptanceRanges() ?? [];
      const summaryId = runId + ".summary." + round;
      const summaryMaterial = (assignmentId: string) => ({
        ranges: recent,
        record: (ranges: IdeAuditRange[]) =>
          searchLog({ phase: "acceptance-delivery", assignmentId, ranges }),
      });
      const summary = await bind(
        recent.length ? recent : [anchor],
        summaryId,
        mission,
        adaptive ? "coverage" : "review",
      );
      const context = [selection.coverage, proof, previous, ...reports].filter(
        Boolean,
      );
      const result = await evaluateAuditCoverage(
        summary,
        signal,
        renew,
        context,
        expansion,
        [...(expansion?.localQuestions ?? [])].map(
          ([path, issue]) => path + " " + issue,
        ),
        inaccessible,
        summaryMaterial(summaryId),
      );
      previous = result.report;
      if (!expansion || !result.assessment)
        return finish(result.status, result.report);
      const a = result.assessment;
      expansion.accept(a.areas);
      expansion.acceptObjectives(a.objectives);
      let fresh = expansion.pendingRequests([
        ...[...expansion.localQuestions].map(([source, issue]) => ({
          kind: "passage" as const,
          scope: "*",
          source,
          line: 0,
          value: ("Уточнить непрочитанный материал: " + issue)
            .replace(/\s+/g, " ")
            .slice(0, 240),
        })),
        ...expansion.consumerRequests(a.consumers),
        ...a.lookups,
      ]);
      expansion.acceptNoCandidates(a.noConsumerCandidatesReason);
      reports.length = 0;
      const open = expansion.unresolved();
      if (!fresh.length && open.length) {
        const question = [
          result.report.split("\n\n")[0],
          ...a.objectives.filter((o) => !o.checked).map((o) => o.basis),
          ...a.lookups.map((q) => q.value),
        ].join(" ");
        fresh = expansion.definitionRequests(question);
      }
      const focusKey = JSON.stringify([
        open.slice().sort(),
        expansion.queries.size,
      ]);
      if (!fresh.length && open.length && !focused.has(focusKey)) {
        focused.add(focusKey);
        const focusId = runId + ".focus." + round;
        const focusedMission = (
          "Проверь по накопленным свидетельствам только открытые вопросы. Для каждого укажи обоснованный результат в пределах репозитория, внешний остаток или адрес следующей проверки. Предмет исходной задачи: " +
          mission
        ).slice(0, 2048);
        const focusBound = await bind(
          recent.length ? recent : [anchor],
          focusId,
          focusedMission,
          "coverage",
        );
        const answer = await optionalAuditFocus(
          () =>
            evaluateAuditCoverage(
              focusBound,
              signal,
              renew,
              [result.report, JSON.stringify({ open })],
              expansion,
              [...expansion.localQuestions.keys()],
              inaccessible,
              { ...summaryMaterial(focusId), focus: true },
            ),
          signal,
          () =>
            searchLog({
              phase: "focus-interrupted",
              round,
              assignmentId: focusId,
              open,
            }),
        );
        if (answer?.assessment) {
          const review = answer.assessment;
          expansion.accept(review.areas);
          expansion.acceptObjectives(review.objectives);
          fresh = expansion.pendingRequests([
            ...fresh,
            ...expansion.consumerRequests(review.consumers),
            ...review.lookups,
          ]);
          expansion.acceptNoCandidates(review.noConsumerCandidatesReason);
          reports.push(answer.report);
          searchLog({
            phase: "focused-assessment",
            round,
            assignmentId: focusId,
            open,
            report: answer.report,
            remaining: review.remaining,
            requests: fresh,
          });
        }
      }
      searchLog({
        phase: "assessment",
        noConsumerCandidatesReason: a.noConsumerCandidatesReason,
        round,
        remaining: a.remaining,
        areas: a.areas,
        objectives: [...expansion.objectives.values()],
        consumers: [...expansion.consumers.values()],
        missing: expansion.unresolved(),
        requests: fresh,
        report: result.report,
      });
      pending = await investigate(fresh, allRanges);
      const missing = expansion.unresolved();
      // Возвращаем новые выводы адресной приёмки в публичную сводку следующей итерации.
      if (reports.length && !fresh.length && !missing.length) continue;
      if (
        !fresh.length &&
        !pending.size &&
        !missing.length &&
        a.remaining !== "repository"
      )
        return finish(result.status, result.report);
      if (!pending.size && !fresh.length) {
        withoutLeads++;
        const more = expansion.fallback(
          !missing.length || missing.some((s) => !expansion.areas.has(s)),
          Math.min(16, withoutLeads * 2),
        );
        for (const p of more) pending.add(p);
        if (!pending.size)
          return finish(
            "blocked",
            [
              result.report,
              "Доступные файлы исчерпаны. Открытые вопросы: " +
                missing.join(", "),
              ...expansion.diagnostics,
            ].join("\n"),
          );
      } else withoutLeads = 0;
      // Недостающие области получают адресное чтение даже при нулевых тематических совпадениях.
      for (const p of expansion.fallback(false, 1)) pending.add(p);
    } catch (error) {
      signal.throwIfAborted();
      return finish(
        "blocked",
        [previous, "Сводка или уточнение: " + String(error), ...reports].join(
          "\n",
        ),
      );
    }
  }
}
