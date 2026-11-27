/**
 * @file .ai/tools/worker-assignment/src/auditExpansion.service.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Ведёт адресные уточнения, свидетельства по областям и очередь следующих шагов одного аудита.
 * @see documentation/specifications/internal-mcp.md
 */
import {
  areaOf,
  inAuditScope,
  lookupKey,
  type AuditScope,
  type AuditLookup,
} from "./auditSearchScope.service";

import type { MatchDecision } from "./screenAuditMatches.service";
import type { IdeAuditRange } from "realize-ai-platform/ide-assignment-queue";

type Citation = { area: string; path: string; line: number };
type Objective = {
  clause: string;
  path: string;
  line: number;
  checked: boolean;
  basis: string;
  probe: string;
  outside?: string;
};
type Consumer = {
  source: string;
  line: number;
  value: string;
  checked: boolean;
  uses: { path: string; line: number }[];
  conclusion: string;
};
export type QueryEvidence = {
  request: AuditLookup;
  matches: number;
  examples: string[];
  refinement?: { scope: string; matches: number }[];
  passageNotes?: string[];
};

/** Повторный запрос, цикл ссылок и уже рассмотренный файл не порождают повторное назначение. */
export class AuditExpansion {
  readonly areas = new Map<string, string[]>();
  readonly seen = new Set<string>();
  readonly reviewed = new Map<string, number>();
  readonly reviewedPassages = new Map<string, IdeAuditRange[]>();
  readonly localQuestions = new Map<string, string>();
  readonly inheritedPins = new Map<string, string>();
  private readonly passageAnswers: {
    request: AuditLookup;
    report: string;
    ranges: IdeAuditRange[];
  }[] = [];
  readonly surveyed = new Map<
    string,
    { paths: number; candidates: string[]; basis: string }[]
  >();
  readonly queries = new Map<string, QueryEvidence>();
  readonly consumers = new Map<string, Consumer>();
  readonly hitPaths = new Map<string, Set<string>>();
  readonly screens = new Map<
    string,
    { pending: Set<string>; decisions: MatchDecision[]; assignments: number }
  >();
  readonly objectives = new Map<string, Objective>();
  readonly citations = new Map<string, Citation>();
  readonly rejected = new Set<string>();
  private absenceOfCandidates = "";
  readonly diagnostics = new Set<string>();
  constructor(
    readonly scope: AuditScope,
    readonly mission: string,
  ) {
    const words = mission.toLowerCase().match(/[\p{L}\d_-]{4,}/gu) ?? [];
    const rank = (p: string) =>
      new Set(words.filter((word) => p.toLowerCase().includes(word))).size;
    for (const path of scope.files.keys()) {
      const area = areaOf(path);
      const paths = this.areas.get(area) ?? [];
      paths.push(path);
      this.areas.set(area, paths);
    }
    for (const [area, paths] of this.areas) {
      this.areas.set(
        area,
        paths
          .map((path) => ({ path, score: rank(path) }))
          .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
          .map((item) => item.path),
      );
    }
  }
  describe() {
    return [...this.areas].map(([area, paths]) => ({
      area,
      inventory: paths.length,
      reviewed: paths.filter((p) => this.reviewed.has(p)).length,
      evidence: this.citations.get(area),
      surveyedPaths: (this.surveyed.get(area) ?? []).reduce(
        (n, part) => n + part.paths,
        0,
      ),
      candidateFiles: (this.surveyed.get(area) ?? []).flatMap(
        (part) => part.candidates,
      ).length,
      pendingCandidates: (this.surveyed.get(area) ?? [])
        .flatMap((part) => part.candidates)
        .filter((p) => !this.reviewed.has(p)),
      availableExamples: paths.filter((p) => !this.seen.has(p)).slice(0, 5),
    }));
  }
  hasCitation(path: string, line: number) {
    return (
      line > 0 &&
      (line <= (this.reviewed.get(path) ?? 0) ||
        !!this.reviewedPassages
          .get(path)
          ?.some((r) => r.startLine <= line && line <= r.endLine))
    );
  }
  describeProfiles() {
    return this.scope.profiles.map((p) => ({
      mode: p.mode,
      paths: p.flags
        .filter((f) => f.startsWith("--path="))
        .map((f) => f.slice(7)),
      areas: [
        ...new Set(
          [...this.scope.files]
            .filter(([, mode]) => mode === p.mode)
            .map(([path]) => areaOf(path)),
        ),
      ],
    }));
  }
  /** Исходный ответ с проверенными координатами хранится отдельно от сокращаемых тематических сводок. */
  keepPassage(request: AuditLookup, report: string, ranges: IdeAuditRange[]) {
    this.passageAnswers.push({ request, report, ranges });
  }
  private relevantPassages(focus: string) {
    const words = new Set(focus.toLowerCase().match(/[\p{L}\d_]{5,}/gu) ?? []);
    const ranked = this.passageAnswers
      .map((entry, index) => {
        const subject = (
          entry.request.source +
          " " +
          entry.request.value +
          " " +
          entry.report.slice(0, 500)
        ).toLowerCase();
        const score = [...words].filter((w) => subject.includes(w)).length;
        return { entry, index, score };
      })
      .sort((a, b) => b.score - a.score || b.index - a.index);
    return [
      ...new Set([
        ...ranked
          .filter((r) => r.entry.request.definition)
          .slice(0, 2)
          .map((r) => r.entry),
        ...this.passageAnswers.slice(-4).reverse(),
        ...ranked.slice(0, 8).map((r) => r.entry),
      ]),
    ];
  }
  exactPassages(focus: string) {
    const choices = this.relevantPassages(focus);
    let remaining = 64 * 1024;
    return choices
      .filter((e) => {
        const bytes = Buffer.byteLength(e.report);
        if (bytes > remaining) return false;
        remaining -= bytes;
        return true;
      })
      .map((e) => ({
        source: e.request.source,
        line: e.request.line,
        question: e.request.value,
        ranges: e.ranges.map((r) => [r.startLine, r.endLine, r.rangeSha256]),
        report: e.report,
      }));
  }
  acceptanceRanges(): IdeAuditRange[] {
    const chosen = new Map<string, IdeAuditRange>();
    let bytes = 0;
    for (const entry of this.relevantPassages(
      [...this.objectives.values()]
        .filter((o) => !o.checked)
        .map((o) => o.basis)
        .join(" "),
    ))
      for (const range of entry.ranges) {
        if (
          chosen.has(range.path) ||
          range.byteLength > 24 * 1024 ||
          bytes + range.byteLength > 40 * 1024
        )
          continue;
        chosen.set(range.path, range);
        bytes += range.byteLength;
        if (chosen.size === 5) return [...chosen.values()];
      }
    return [...chosen.values()];
  }
  /** Имена в нерешённом вопросе используются для штатного поиска определений, включая импорт из соседнего модуля. */
  definitionRequests(question: string): AuditLookup[] {
    const names = [
      ...new Set(
        question.match(
          /\b(?:[a-z]+[A-Z][a-zA-Z0-9]*|[A-Z][a-z]+[A-Z][a-zA-Z0-9]*|[A-Z]+_[A-Z_0-9]+)\b/gu,
        ) ?? [],
      ),
    ];
    return this.pendingRequests(
      names.map((value) => ({
        kind: "definition" as const,
        scope: "*",
        source: "",
        line: 0,
        value,
        question: question.slice(0, 460),
      })),
    ).slice(0, 5);
  }
  accept(citations: Citation[]) {
    for (const c of citations) {
      if (
        areaOf(c.path) === c.area &&
        this.reviewed.has(c.path) &&
        (c.line >= 1 || (c.line === 0 && this.reviewed.get(c.path) === 0)) &&
        c.line <= this.reviewed.get(c.path)!
      )
        this.citations.set(c.area, c);
    }
  }
  /** Предметные области сохраняются между итерациями даже при отсутствии совпадений по прежним именам. */
  acceptObjectives(rows: Objective[]) {
    for (const row of rows) {
      const key = row.clause.trim().toLowerCase();
      if (
        !key ||
        !this.mission.toLowerCase().includes(key) ||
        this.objectives.get(key)?.checked
      )
        continue;
      const verified = this.hasCitation(row.path, row.line);
      const negative = [...this.queries.values()].some(
        (q) =>
          q.request.scope === "*" &&
          q.request.value === row.probe &&
          q.matches === 0 &&
          !this.rejected.has(lookupKey(q.request)),
      );
      this.objectives.set(key, {
        ...row,
        checked: row.checked && (verified || negative) && !!row.basis.trim(),
        outside:
          verified &&
          !!row.basis.trim() &&
          [...this.queries.values()].some(
            (q) =>
              q.request.value === row.probe &&
              !q.refinement &&
              !this.rejected.has(lookupKey(q.request)),
          )
            ? row.outside?.trim()
            : undefined,
      });
    }
  }
  /** Вывод о потребителях принимается после собственного обратного поиска и чтения его кандидатов. */
  consumerRequests(rows: Consumer[]) {
    const requests: AuditLookup[] = [];
    for (const row of rows) {
      if (!this.hasCitation(row.source, row.line)) continue;
      const request: AuditLookup = {
        kind: "consumer",
        scope: "*",
        source: row.source,
        line: row.line,
        value: row.value,
      };
      const key = lookupKey(request);
      if (this.consumers.get(key)?.checked || this.rejected.has(key)) continue;
      const hits = this.hitPaths.get(key);
      const required = this.screens.get(key)?.pending ?? hits;
      const checked =
        !!hits &&
        row.checked &&
        !!row.conclusion.trim() &&
        [...required!].every((path) => this.reviewed.has(path)) &&
        row.uses.every(
          (c) =>
            hits.has(c.path) &&
            c.line > 0 &&
            (c.line <= (this.reviewed.get(c.path) ?? 0) ||
              this.screens
                .get(key)
                ?.decisions.some(
                  (d) =>
                    d.kind === "use" && d.path === c.path && d.line === c.line,
                )),
        );
      const confirmed =
        this.screens
          .get(key)
          ?.decisions.filter((d) => d.kind === "use")
          .map(({ path, line }) => ({ path, line })) ?? [];
      const uses = [
        ...new Map(
          [...confirmed, ...row.uses].map((c) => [
            JSON.stringify([c.path, c.line]),
            c,
          ]),
        ).values(),
      ];
      this.consumers.set(key, { ...row, uses, checked });
      if (!hits) requests.push(request);
    }
    return requests;
  }
  /** Квитанции классификации закрывают локальный поиск; неоднозначные файлы остаются в плане полного чтения. */
  recordScreen(
    request: AuditLookup,
    screen: {
      pending: Set<string>;
      decisions: MatchDecision[];
      assignments: number;
    },
  ) {
    const key = lookupKey(request);
    this.screens.set(key, screen);
    if (request.kind !== "consumer" || request.scope !== "*") return;
    const hits = this.hitPaths.get(key);
    if (!hits)
      throw new Error(
        "assignment_search_failed: отсутствует результат запроса",
      );
    const classified = new Set(screen.decisions.map((d) => d.path));
    const checked =
      screen.pending.size === 0 && [...hits].every((p) => classified.has(p));
    const uses = screen.decisions
      .filter((d) => d.kind === "use")
      .map((d) => ({ path: d.path, line: d.line }));
    this.consumers.set(key, {
      source: request.source,
      line: request.line,
      value: request.value,
      checked,
      uses,
      conclusion: `Литеральный обратный поиск: совпавших файлов ${hits.size}, подтверждённых употреблений в окнах ${uses.length}, файлов на уточнение ${screen.pending.size}. Границы — выбранные профили и искомое обозначение.`,
    });
  }
  describeQueries() {
    return [...this.queries].map(([key, evidence]) => {
      const hits = this.hitPaths.get(key) ?? new Set<string>();
      const screen = this.screens.get(key);
      const pending = [...(screen?.pending ?? hits)].filter(
        (p) => !this.reviewed.has(p),
      );
      return {
        ...evidence,
        completeFileReads: [...hits].filter((p) => this.reviewed.has(p)).length,
        screenedWindows: screen?.decisions.length ?? 0,
        pendingFullFiles:
          evidence.refinement || evidence.request.kind === "passage"
            ? []
            : pending,
        allRequestedReadsComplete: !evidence.refinement && pending.length === 0,
        consumer: this.consumers.get(key),
      };
    });
  }
  acceptNoCandidates(reason: string) {
    const scopesCovered = [...this.areas.keys()].every((a) =>
      this.citations.has(a),
    );
    const goalsCovered =
      this.objectives.size > 0 &&
      [...this.objectives.values()].every((g) => g.checked || g.outside);
    const negative = [...this.queries.values()].some(
      (q) =>
        q.request.scope === "*" &&
        q.matches === 0 &&
        !this.rejected.has(lookupKey(q.request)),
    );
    this.absenceOfCandidates =
      !this.consumers.size && scopesCovered && goalsCovered && negative
        ? reason.trim()
        : "";
  }
  needsConsumers() {
    return /потребител|кто\s+использует|вызывающ|consumers?|callers?/iu.test(
      this.mission,
    );
  }
  pendingRequests(requests: AuditLookup[]) {
    const result = new Map<string, AuditLookup>();
    for (const r of requests) {
      const key = lookupKey(r);
      if (this.queries.has(key) || this.rejected.has(key) || result.has(key))
        continue;
      if (
        !r.value.trim() ||
        /[\r\n\x00]/u.test(r.value) ||
        (r.scope !== "*" &&
          ![...this.scope.files.keys()].some((p) => inAuditScope(p, r.scope)))
      ) {
        this.diagnostics.add(
          "Недопустимая область или пустой запрос: " + r.scope,
        );
        continue;
      }
      if (
        r.kind === "passage" &&
        (!this.scope.files.has(r.source) ||
          !inAuditScope(r.source, r.scope) ||
          !Number.isSafeInteger(r.line) ||
          r.line < 0)
      ) {
        this.diagnostics.add(
          "Адресное чтение требует путь инвентаря и неотрицательную строку: " +
            r.source,
        );
        continue;
      }
      if (r.kind === "consumer" && !this.hasCitation(r.source, r.line)) {
        this.diagnostics.add(
          "Для поиска потребителя нужен проверенный источник и строка: " +
            r.source,
        );
        continue;
      }
      result.set(key, r);
    }
    return [...result.values()];
  }
  fallback(all: boolean, width: number) {
    const paths: string[] = [];
    for (const [area, candidates] of this.areas) {
      if (all || !this.citations.has(area))
        paths.push(
          ...candidates.filter((p) => !this.seen.has(p)).slice(0, width),
        );
    }
    return paths;
  }
  unresolved() {
    const missing = [...this.areas.keys()].filter(
      (area) => !this.citations.has(area),
    );
    if (
      this.needsConsumers() &&
      !this.absenceOfCandidates &&
      ![...this.queries.values()].some(
        (q) => q.request.kind === "consumer" && q.request.scope === "*",
      )
    )
      missing.push(
        "обратный поиск по потребителям по всем заявленным областям",
      );
    for (const goal of this.objectives.values())
      if (!goal.checked && !goal.outside)
        missing.push("область поручения " + goal.clause);
    for (const path of this.localQuestions.keys())
      missing.push("не завершено чтение " + path);
    for (const row of this.consumers.values())
      if (!row.checked)
        missing.push("потребители " + row.source + " " + row.value);
    if (!this.objectives.size) missing.push("заявленные материалы поручения");
    if (
      this.needsConsumers() &&
      !this.consumers.size &&
      !this.absenceOfCandidates
    )
      missing.push("доказательные выводы о потребителях");
    return missing;
  }
}
