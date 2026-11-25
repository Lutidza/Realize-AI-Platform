/**
 * @file .ai/tools/worker-assignment/test/conclusion/articleAuditReport.fixture.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Проводит детерминированный аудит по закреплённым диапазонам и выдаёт один из двух тестовых отчётов.
 * @see documentation/specifications/task-management/execution/article-audit-conclusion.md
 */
import assert from "node:assert/strict";
import type { ReworkInboxRepository } from "@realize/payload-task-manager/audit-review";
import type { setupCheckpointPilot } from "../checkpoints/checkpointPilot.fixture";
import { advanceAuditCheckpoint } from "../../src/checkpoints/advanceAuditCheckpoint.service";
import type { SingleReadTransport } from "../../src/exchange/SingleRead.types";

const folder = "src/components/admin/documents/";
const route = "src/app/(system-admin)/system/documents/actions/create/page.tsx";

export const auditSamples = [
  [route, 33, 47, "защищённый маршрут и открытие формы"],
  [
    folder + "ArticleCreateForm.component.tsx",
    10,
    26,
    "JSX и подключение хука",
  ],
  [folder + "ArticleCreateField.component.tsx", 7, 21, "представление поля"],
  [folder + "ArticleCreateSectionFields.component.tsx", 8, 24, "поля раздела"],
  [folder + "ArticleCreateForm.module.css", 1, 16, "стили формы"],
  [
    folder + "ArticleCreateForm.types.ts",
    9,
    21,
    "типы черновика и представления",
  ],
  [folder + "DocumentArticleForm.types.ts", 8, 19, "контракт данных статьи"],
  [
    folder + "useArticleCreateForm.hook.ts",
    192,
    240,
    "состояние отправки и проверка сохранения",
  ],
  [
    folder + "suggestDocumentIdentifier.util.ts",
    7,
    18,
    "предложение идентификатора",
  ],
  [
    folder + "documentArticleInput.validator.ts",
    9,
    24,
    "серверная валидация входа",
  ],
  [
    folder + "createDocumentArticle.action.ts",
    73,
    92,
    "проверка доступа и запись через Payload",
  ],
  [
    folder + "matchesSubmittedDocumentArticle.util.ts",
    11,
    29,
    "сравнение полей и вложенных разделов",
  ],
  [
    folder + "createDocumentArticle.action.ts",
    104,
    125,
    "чтение результата с учётом прав",
  ],
] as const;

export function auditQuotes(disputed: boolean) {
  return {
    responsibilities:
      "Маршрут открывает форму после проверки доступа. JSX формы использует отдельный хук.",
    "create-chain":
      "Форма вызывает save, сервер проверяет участника и входные данные и создаёт documents с overrideAccess: false.",
    "verification-chain": disputed
      ? "После неопределённого ответа достаточно найти запись по slug."
      : "После неопределённого ответа checkSave ищет запись по slug и сравнивает её поля с отправленным черновиком.",
    "findings-and-limits":
      "Это статическое чтение закреплённых строк. Браузер и фактическая запись в рабочую БД не проверялись.",
  };
}

/** Через штатный checkpoint фиксирует именно те строки, на которые опираются выводы имитатора. */
export async function runArticleAudit(
  f: Pick<
    Awaited<ReturnType<typeof setupCheckpointPilot>>,
    "store" | "task" | "policy" | "initial"
  > & { attemptId: string },
  disputed: boolean,
  inbox?: ReworkInboxRepository,
  extraReportLine?: string,
) {
  const report = [
    ...auditSamples.map(
      ([path, start, end, role]) =>
        path + " L" + start + "–" + end + " — " + role,
    ),
    ...Object.values(auditQuotes(disputed)),
    ...(extraReportLine ? [extraReportLine] : []),
  ].join("\n");
  let step = 0;
  const transport: SingleReadTransport = {
    async send(request) {
      if (f.initial.state.identity.rework) {
        const user = JSON.parse(
          JSON.parse(request.body).messages[0].content,
        ).rework;
        assert.equal(user.work.workId, f.initial.state.identity.rework.workId);
        assert.equal(user.work.action, "return_audit");
        assert(
          user.work.points.length &&
            user.previousReport &&
            user.previousConclusionSha256,
        );
      }
      const item = auditSamples[step++];
      const choice = item
        ? {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  type: "function",
                  id: "audit-source-" + step,
                  function: {
                    name: "repo_read_file",
                    arguments: JSON.stringify({
                      path: item[0],
                      startLine: item[1],
                      lineCount: item[2] - item[1] + 1,
                    }),
                  },
                },
              ],
            },
          }
        : {
            finish_reason: "stop",
            message: { role: "assistant", content: report },
          };
      return {
        attemptId: request.attemptId,
        requestId: request.requestId,
        body: { choices: [choice] },
      };
    },
  };
  let snapshot = f.initial;
  const lease = await f.store.claim(
    f.attemptId,
    snapshot.revision,
    "article-audit-simulator",
    90000,
  );
  try {
    for (let index = 0; index <= auditSamples.length; index++) {
      snapshot = await advanceAuditCheckpoint(
        f.store,
        snapshot,
        lease,
        f.task,
        f.policy,
        transport,
        undefined,
        inbox,
      );
    }
    assert.equal(
      snapshot.state.status,
      "received",
      JSON.stringify(
        snapshot.state.status === "blocked" && snapshot.state.reason,
      ),
    );
  } finally {
    await f.store.release(lease);
  }
}
