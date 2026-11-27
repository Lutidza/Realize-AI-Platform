/**
 * @file .ai/tools/worker-assignment/test/auditExpansion.test.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Проверяет переходы от открытой области и объявления к новой выдаче и к подтверждённому потребителю.
 * @see documentation/specifications/internal-mcp.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  locateAuditMatches,
  validMatchDecision,
  type MatchDecision,
} from "../src/screenAuditMatches.service";
import type { AuditLookup } from "../src/auditSearchScope.service";
import { hashAuditText } from "../src/checkpoints/hashAuditText.util";
import { verifyAuditDeliveries } from "../src/auditRanges.service";
import { createTemporaryAssignment } from "./temporaryAssignment.fixture";
import { prepareIdeAuditInput } from "../src/prepareIdeAuditInput.service";
import { bindAssignment } from "../src/bindAssignment.service";
import { AuditExpansion } from "../src/auditExpansion.service";
import { planAuditPassage } from "../src/readAuditPassage.service";
import { revalidateAuditMaterial } from "../src/revalidateAuditMaterial.service";
import { inventoryPackets } from "../src/surveyAuditInventory.service";
import { optionalAuditFocus } from "../src/evaluateAuditCoverage.service";
import {
  expansiveAudit,
  broadLookupBranches,
  inAuditScope,
  lookupAuditSources,
  lookupKey,
  type AuditScope,
} from "../src/auditSearchScope.service";

function scenario() {
  const scope: AuditScope = {
    profiles: [],
    excluded: 0,
    files: new Map([
      ["engine/producer.ts", "code"],
      ["plugin/use.ts", "code"],
      ["plugin/other.ts", "code"],
    ]),
  };
  return new AuditExpansion(scope, "Проверь потребителей");
}

test("прерывание дополнительной проверки сохраняет основной раунд, отмена запуска и прочие ошибки передаются владельцу", async () => {
  const abort = new AbortController();
  const interrupted = new Error("assignment_executor_interrupted");
  const failure = (error: Error) => () => Promise.reject(error);
  let interruptions = 0;
  const record = () => {
    interruptions++;
  };
  assert.equal(
    await optionalAuditFocus(async () => "answer", abort.signal, record),
    "answer",
  );
  assert.equal(
    await optionalAuditFocus(failure(interrupted), abort.signal, record),
    undefined,
  );
  await assert.rejects(
    optionalAuditFocus(
      failure(new Error("assignment_delivery_incomplete")),
      abort.signal,
      record,
    ),
    /assignment_delivery_incomplete/,
  );
  abort.abort(new Error("lease expired"));
  await assert.rejects(
    optionalAuditFocus(failure(interrupted), abort.signal, record),
    /lease expired/,
  );
  assert.equal(interruptions, 1);
});

test("инвентарные пакеты сохраняют все пути и не приписывают соседний каталог вложенной области", () => {
  const paths = Array.from(
    { length: 80 },
    (_, i) => "module/inner/source-" + i + ".ts",
  );
  const inventory = {
    files: new Map(paths.map((p) => [p, "code"])),
    profiles: [],
    excluded: 0,
  };
  const packets = inventoryPackets(new Map([["module", paths]]), 100);
  assert.ok(packets.length > 1);
  assert.deepEqual(
    packets.flatMap((p) => p.paths),
    paths,
  );
  assert.equal(inAuditScope("module/inner2/file.ts", "module/inner"), false);
  const q: AuditLookup = {
    kind: "text",
    scope: "module/inner",
    value: "keyword",
    source: "",
    line: 0,
  };
  assert.deepEqual(broadLookupBranches(inventory, q, paths), [
    { scope: "module/inner", matches: 80 },
  ]);
  assert.equal(
    broadLookupBranches(inventory, { ...q, kind: "consumer" }, paths),
    undefined,
  );
  assert.equal(broadLookupBranches(inventory, q, paths.slice(0, 3)), undefined);
});

test("адресное уточнение закрепляет повторное чтение известного пути без ложного EOF", () => {
  const path = "engine/producer.ts",
    text =
      Array.from(
        { length: 1200 },
        (_, i) => "строка " + i + " подробности\r\n",
      ).join("") + "хвост",
    sha = hashAuditText(text);
  const [range] = planAuditPassage(path, text, sha, 500);
  assert.equal(range.startLine, 488);
  assert.equal(range.endLine, 512);
  assert.equal(planAuditPassage(path, text, sha, 1202).length, 0);
  const full = planAuditPassage(path, text, sha, 0).map((r, i) => ({
    assignmentId: String(i),
    ranges: [r],
  }));
  assert.ok(full.length > 1);
  assert.equal(verifyAuditDeliveries(full, full).completeFiles, 1);
  const state = scenario(),
    q: AuditLookup = {
      kind: "passage",
      scope: "engine",
      source: path,
      value: "назначение",
      line: 500,
    };
  assert.deepEqual(
    state.pendingRequests([q, { ...q, value: " НАЗНАЧЕНИЕ " }]),
    [q],
  );
  assert.equal(
    state.pendingRequests([
      q,
      { ...q, value: "новый вопрос к этому диапазону" },
    ]).length,
    2,
  );
  assert.deepEqual(
    state.pendingRequests([{ ...q, source: "plugin/use.ts" }]),
    [],
  );
  state.reviewedPassages.set(path, [range]);
  assert.ok(state.hasCitation(path, 500));
  assert.equal(state.hasCitation(path, 800), false);
});

test("прежний отчёт принимается только при совпадении всех его снимков; источник определения передаётся на приёмку", async (t) => {
  const a = "src/factory.ts",
    b = "src/client.ts",
    data = "export function buildRecord() {return 1;}\n";
  const f = await createTemporaryAssignment(t, {
    reviewScope: { paths: [a, b] },
    reviewFileContents: { [a]: data, [b]: "новое содержимое" },
  });
  const state = new AuditExpansion(
    {
      files: new Map([
        [a, "code"],
        [b, "code"],
      ]),
      profiles: [],
      excluded: 0,
    },
    "Проверь использование",
  );
  const range = planAuditPassage(a, data, hashAuditText(data), 0)[0],
    stale = { ...range, path: b };
  const source = (assignmentId: string, report: string) => ({
    assignmentId,
    report,
    phase: "source-review",
    request: null,
  });
  const answer = await revalidateAuditMaterial(
    f.policy,
    state,
    {
      attempt: "прошлая",
      assessment: JSON.stringify({
        report: "Открытый вопрос buildRecord",
        objectives: [],
        consumers: [],
      }),
      reports: [
        source("own", "верная функция"),
        source("mixed", "устаревший общий вывод"),
      ],
      deliveries: [
        { assignmentId: "own", ranges: [range] },
        { assignmentId: "mixed", ranges: [range, stale] },
      ],
    },
    new AbortController().signal,
    () => {},
  );
  assert.equal(state.reviewed.get(a), 1);
  assert.equal(state.reviewed.has(b), false);
  assert.equal(answer.reports.length, 1);
  assert.ok(answer.changed.has(b));
  const [probe] = state.definitionRequests(answer.open);
  assert.equal(probe.kind, "definition");
  assert.equal(probe.value, "buildRecord");
  const clarification = {
    ...probe,
    kind: "passage" as const,
    source: a,
    line: 1,
    definition: probe.value,
  };
  const report =
    "Свидетельства по диапазону. ".repeat(180) +
    "Итоговый вывод находится в конце.";
  state.keepPassage(clarification, report, [range]);
  assert.equal(state.exactPassages("buildRecord")[0].report, report);
  assert.deepEqual(state.acceptanceRanges(), [range]);
});

test("внешний остаток цели требует проверенной строки и выполненной пробы", () => {
  const s = scenario(),
    path = "engine/producer.ts";
  const goal = {
    clause: "потребителей",
    path,
    line: 2,
    basis: "изучена точка вызова",
    probe: "handler",
    checked: false,
    outside: "журнал внешних клиентов",
  };
  s.reviewed.set(path, 4);
  s.acceptObjectives([goal]);
  assert.ok(s.unresolved().includes("область поручения потребителей"));
  const request: AuditLookup = {
    kind: "text",
    scope: "*",
    value: "handler",
    source: "",
    line: 0,
  };
  s.queries.set(lookupKey(request), { request, matches: 1, examples: [] });
  s.acceptObjectives([goal]);
  assert.equal(s.objectives.get(goal.clause)?.checked, false);
  assert.equal(s.objectives.get(goal.clause)?.outside, goal.outside);
  assert.ok(!s.unresolved().includes("область поручения потребителей"));
});

test("ссылка на чужой диапазон не закрывает область, повторная выдача выбирает непроверенный файл", () => {
  const state = scenario();
  state.seen.add("engine/producer.ts");
  state.reviewed.set("engine/producer.ts", 5);
  state.accept([
    { area: "plugin", path: "engine/producer.ts", line: 1 },
    { area: "engine", path: "engine/producer.ts", line: 6 },
  ]);
  assert.equal(state.citations.size, 0);
  state.accept([{ area: "engine", path: "engine/producer.ts", line: 2 }]);
  assert.deepEqual(state.fallback(false, 1), ["plugin/other.ts"]);
  state.seen.add("plugin/other.ts");
  assert.deepEqual(state.fallback(false, 1), ["plugin/use.ts"]);
});

test("обратный поиск обязателен до вывода, повторный запрос и цикл не создают дубликат", () => {
  const state = scenario(),
    source = "engine/producer.ts",
    client = "plugin/use.ts";
  state.reviewed.set(source, 5);
  const pending = {
    source,
    line: 3,
    value: "makeRecord",
    checked: true,
    uses: [{ path: client, line: 9 }],
    conclusion: "импорт и вызов",
  };
  const [q] = state.consumerRequests([pending]);
  assert.equal(q.kind, "consumer");
  assert.equal(state.consumers.get(lookupKey(q))?.checked, false);
  assert.deepEqual(state.pendingRequests([q, q]), [q]);
  state.queries.set(lookupKey(q), { request: q, matches: 2, examples: [] });
  state.hitPaths.set(lookupKey(q), new Set([source, client]));
  assert.deepEqual(state.consumerRequests([pending]), []);
  assert.equal(state.consumers.get(lookupKey(q))?.checked, false);
  state.reviewed.set(client, 12);
  state.consumerRequests([pending]);
  assert.equal(state.consumers.get(lookupKey(q))?.checked, true);
  assert.deepEqual(state.pendingRequests([q]), []);
});

test("нулевая выдача сохраняет исследованную границу, запрос по пути не выходит из инвентаря", async () => {
  const s = scenario(),
    source = "engine/producer.ts";
  s.reviewed.set(source, 5);
  const row = {
    source,
    line: 1,
    value: "namedBinding",
    checked: true,
    uses: [],
    conclusion: "ноль совпадений в доступной области",
  };
  const [q] = s.consumerRequests([row]);
  s.hitPaths.set(lookupKey(q), new Set());
  s.consumerRequests([row]);
  assert.equal(s.consumers.get(lookupKey(q))?.checked, true);
  assert.deepEqual(
    [
      ...(await lookupAuditSources(
        ".",
        s.scope,
        { ...q, kind: "path", scope: "plugin", value: "use" },
        new AbortController().signal,
      )),
    ],
    [["plugin/use.ts", "plugin/use.ts"]],
  );
  assert.equal(expansiveAudit("Найди значение в файле config.ts"), false);
  assert.equal(expansiveAudit("Проверь потребителей config.ts"), true);
});

test("все совпадающие строки входят в проверенные окна, разрыв между окнами не выдаётся за полный файл", () => {
  const lines = Array.from({ length: 30 }, (_, i) =>
    i === 2 || i === 4 || i === 26
      ? "имя makeRecord\r\n"
      : "без совпадения\r\n",
  );
  const src = lines.join(""),
    path = "plugin/use.ts";
  const q: AuditLookup = {
    kind: "consumer",
    scope: "*",
    source: "engine/producer.ts",
    line: 1,
    value: "makeRecord",
  };
  const windows = locateAuditMatches(path, src, hashAuditText(src), q);
  assert.deepEqual(
    windows.map((w) => w.matches),
    [[3, 5], [27]],
  );
  for (const { range: r } of windows)
    assert.equal(
      r.rangeSha256,
      hashAuditText(lines.slice(r.startLine - 1, r.endLine).join("")),
    );
  const delivery = {
    assignmentId: "run.lookup.1.1",
    ranges: windows.map((w) => w.range),
  };
  assert.deepEqual(
    verifyAuditDeliveries([delivery], [delivery], "search-windows"),
    { verifiedRanges: 2, completeFiles: 0, errors: [] },
  );
  assert.ok(verifyAuditDeliveries([delivery], [delivery]).errors.length);
  assert.ok(
    verifyAuditDeliveries(
      [delivery],
      [{ ...delivery, ranges: delivery.ranges.slice(1) }],
      "search-windows",
    ).errors.length,
  );
  const w = windows[0],
    decision: MatchDecision = {
      path,
      startLine: w.range.startLine,
      line: 3,
      kind: "use",
      reason: "Вызов именованного экспорта",
    };
  assert.equal(validMatchDecision(w, [decision]), decision);
  assert.equal(validMatchDecision(w, [{ ...decision, line: 4 }]), undefined);
  assert.equal(validMatchDecision(w, [decision, decision]), undefined);
});

test("проверка употребления сохраняет результат между сводками и требует уточнить неоднозначный путь", () => {
  const s = scenario(),
    path = "plugin/use.ts",
    source = "engine/producer.ts";
  s.reviewed.set(source, 9);
  const row = {
    source,
    line: 2,
    value: "makeRecord",
    checked: false,
    uses: [],
    conclusion: "",
  };
  const [q] = s.consumerRequests([row]),
    key = lookupKey(q);
  s.queries.set(key, { request: q, matches: 1, examples: [] });
  s.hitPaths.set(key, new Set([path]));
  const d: MatchDecision = {
    path,
    startLine: 2,
    line: 3,
    kind: "use",
    reason: "Прямой вызов",
  };
  s.recordScreen(q, {
    pending: new Set([path]),
    decisions: [{ ...d, kind: "review" }],
    assignments: 1,
  });
  assert.deepEqual(s.describeQueries()[0].pendingFullFiles, [path]);
  assert.equal(s.consumers.get(key)?.checked, false);
  s.recordScreen(q, { pending: new Set(), decisions: [d], assignments: 1 });
  s.consumerRequests([row]);
  assert.equal(s.consumers.get(key)?.checked, true);
  assert.deepEqual(s.consumers.get(key)?.uses, [{ path, line: 3 }]);
  assert.equal(s.describeQueries()[0].completeFileReads, 0);
});

test("обязательство из текста требует проверенной строки или выполненной отрицательной пробы", () => {
  const s = scenario();
  const objective = {
    clause: "потребителей",
    path: "plugin/use.ts",
    line: 2,
    checked: true,
    basis: "конкретная строка",
    probe: "",
  };
  s.acceptObjectives([objective, { ...objective, clause: "другой проект" }]);
  assert.equal(s.objectives.size, 1);
  assert.equal(s.objectives.get("потребителей")?.checked, false);
  s.reviewed.set(objective.path, 2);
  s.acceptObjectives([objective]);
  assert.equal(s.objectives.get("потребителей")?.checked, true);
});

test("реальный привязанный reader передаёт раздельные окна с их хешами и сохраняет права Assignment", async (t) => {
  const path = "src/query.ts",
    other = "src/other.ts";
  const lines = Array.from({ length: 24 }, (_, i) =>
    i === 1 || i === 20 ? "consume(record)\r\n" : "другая строка\n",
  );
  const f = await createTemporaryAssignment(t, {
    reviewScope: { paths: [path, other] },
    reviewFileContents: { [path]: lines.join(""), [other]: "another source" },
  });
  const bound = await bindAssignment(f.policy, f.lockPath);
  assert.ok(bound.context);
  const windows = locateAuditMatches(
    path,
    lines.join(""),
    bound.context.readPins[path],
    { kind: "consumer", scope: "*", value: "consume", source: other, line: 1 },
  );
  const { input, receipts } = await prepareIdeAuditInput(bound.context, {
    [path]: windows.map((w): [number, number] => [
      w.range.startLine,
      w.range.endLine,
    ]),
  });
  assert.deepEqual(
    receipts,
    windows.map((w) => w.range),
  );
  assert.equal(JSON.parse(input).reviewFiles.length, 2);
  assert.equal(
    JSON.parse(input).reviewFiles[1].text,
    lines
      .slice(windows[1].range.startLine - 1, windows[1].range.endLine)
      .join(""),
  );
  await assert.rejects(
    prepareIdeAuditInput(bound.context, { "src/outside.ts": [1, 1] }),
    /assignment_read/,
  );
});
