/**
 * @file .ai/tools/worker-assignment/src/planTextAssignment.service.ts
 * @version 1.1.0
 * @date 2026-11-26
 * @description Собирает ограниченное поручение на чтение обозначенных в задаче файлов.
 * @see documentation/specifications/internal-mcp.md
 */
import { createHash } from "node:crypto";
import {
  readRepositoryFile,
  type RepositoryReadPolicy,
} from "realize-ai-platform/repository-read-policy";
import { readGitHead } from "../../git-delivery/src/read/gitRead.server.index";
import { bindPreparedAssignment } from "./bindAssignment.service";
import { validateAssignmentDefinition } from "./validateAssignmentDefinition.validator";

const role = ".ai/roles/process-tools-operations/scope-contour-owner/INDEX.md";
const requiredSources = [
  "AGENTS.md",
  role,
  ".ai/workflows/core/worker-assignment/WORKFLOW.md",
  ".ai/rules/worker-runtime/RULE-WORKER-ASSIGNMENT-MANIFEST.md",
  ".ai/rules/development/RULE-SEARCH-SCOPE-DISCIPLINE.md",
  ".ai/checks/pre-implementation/CHECK-SEARCH-SCOPE-DISCIPLINE.md",
  ".ai/checks/worker-runtime/CHECK-WORKER-ASSIGNMENT-SCOPE.md",
];

/** Снимок строится оркестратором из тех же байтов, хеши которых попадут в контекст. */
export async function planTextAssignment(
  policy: RepositoryReadPolicy,
  id: string,
  mission: string,
  targets: string[],
  coverage: string,
  plannedPaths?: Iterable<string>,
  purpose:
    "review" | "screen" | "coverage" | "passage" | "inventory" = "review",
) {
  const sourceReview = targets.some((path) => /\.[cm]?[jt]sx?$/.test(path));
  const instructions = [...requiredSources];
  if (sourceReview)
    instructions.push(
      ".ai/rules/development/RULE-CODE-STRUCTURE.md",
      ".codex/skills/feature-decomposition-guard/SKILL.md",
      ".ai/checks/development/CHECK-CODE-STRUCTURE.md",
    );
  const scope = targets.filter((path) => !instructions.includes(path));
  // Обязательная инструкция может сама быть целью аудита. Для контракта манифеста
  // используем другой уже назначенный путь, а reader передаст только заказанный диапазон.
  if (!scope.length && plannedPaths) {
    for (const path of plannedPaths)
      if (!instructions.includes(path)) {
        scope.push(path);
        break;
      }
  }
  if (!scope.length) throw new Error("assignment_scope_overlaps_instructions");
  const { head } = await readGitHead({ policy });
  if (!head) throw new Error("assignment_revision_missing");
  const identity = { id, revision: 1, baseCommit: head };
  const manifest = {
    ...identity,
    mission,
    assignedBy: "orchestrator",
    returnsTo: "orchestrator",
    ownerLayer: "repository",
    role,
    roleReason: "Статическое исследование обозначенной области",
    mode: "static-read-only",
    requiredSources: instructions,
    reviewScope: { paths: scope },
    permissions: {
      read: ["requiredSources", "reviewScope"],
      writePaths: [],
      tools: ["repo_read_file"],
      output: "reply-to-orchestrator",
    },
    checks: ["Сверить вывод с закреплёнными исходниками", coverage],
    expectedOutput: [
      purpose === "inventory"
        ? "Разобрать метаданные из штатного поиска и вернуть обоснованные пути для дальнейшей проверки содержания в отдельном Assignment."
        : purpose === "passage"
          ? "Проверить только переданные строки. Привести предметные наблюдения со строками, либо границы отрицательного результата. Отсутствующие смежные источники указать отдельно. Завершить локальное чтение, когда его диапазон рассмотрен."
          : purpose === "screen"
            ? "Вернуть decisions по каждому закреплённому окну с классификацией, точной строкой и основанием."
            : purpose === "coverage"
              ? "Принять переданные оркестратором отчёты отдельных Assignment, протокол поиска и закреплённые фрагменты. По этому набору свидетельств вернуть общий отчёт и assessment. Локальный reviewScope задаёт дополнительные исходники для чтения в этой приёмке."
              : "Ответ на предметный вопрос по указанным источникам. Для поиска объявления достаточно показать точное значение и путь. Проверяй поведение реализации только по отдельному запросу.",
      "Это отчёт текущего запуска " +
        id +
        ". Подтверждение приёма, runId и доставка отчёта в диалог принадлежат оркестратору и клиенту. Исполнитель возвращает предметный результат.",
    ],
    stopCondition:
      purpose === "inventory"
        ? "Завершить отбор, когда рассмотрен переданный список путей. Отсутствие оснований предложить файл отражается пустым списком и причиной."
        : purpose === "passage"
          ? "Вернуть blocked, если переданный диапазон невозможно прочитать. Отдельно сообщить открытые вопросы из других областей оркестратору."
          : purpose === "coverage"
            ? "Завершить приёмку при доказанном результате в пределах поручения. Открытый локальный вопрос снабдить точным адресом следующей проверки. Недоступные внешние факты обозначить отдельно."
            : "Вернуть blocked при недостатке материалов или необходимости записи.",
  };
  let remaining = 384 * 1024;
  const files = [];
  for (const path of [...instructions, ...scope]) {
    const file = await readRepositoryFile(policy, path, {
      maximumBytes: instructions.includes(path) ? remaining : 2 * 1024 * 1024,
    }).catch((error) => {
      throw new Error(
        "assignment_read: " +
          path +
          " (" +
          String(error?.code ?? "READ_FAILED") +
          ", бюджет " +
          remaining +
          " байт)",
      );
    });
    if (instructions.includes(path)) remaining -= file.bytes.length;
    files.push({
      path,
      text: file.text,
      sha256: file.sha256,
      bytes: file.bytes.length,
    });
  }
  const digest = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const lock = {
    ...identity,
    manifestPath: "assignment.json",
    manifestSha256: digest(manifest),
    files: Object.fromEntries(files.map((file) => [file.path, file.sha256])),
  };
  const { assignment } = validateAssignmentDefinition(manifest, lock);
  return bindPreparedAssignment(policy, {
    packageComplete: true,
    assignment,
    lockSha256: digest(lock),
    sources: files.slice(0, instructions.length),
    reviewFiles: files.slice(instructions.length),
    issues: [],
  });
}
