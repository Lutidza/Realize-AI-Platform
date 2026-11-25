# Шаблон: Worker Assignment Manifest (`TEMPLATE-WORKER-ASSIGNMENT-MANIFEST`)

```yaml
template_id: TEMPLATE-WORKER-ASSIGNMENT-MANIFEST
template_type: ai-runtime-manifest-template
owner_layer: .ai/templates/worker-assignment/
runtime_owner: .ai/workflows/core/worker-assignment/WORKFLOW.md
runtime_sources:
  - .ai/checks/worker-runtime/CHECK-WORKER-ASSIGNMENT-SCOPE.md
  - .ai/rules/worker-runtime/RULE-WORKER-ASSIGNMENT-MANIFEST.md
  - .ai/workflows/core/worker-assignment/WORKFLOW.md
```

## Сообщение исполнителю

Образец заполнен для статического аудита формы «Создать статью». Для другого
назначения подставь его роль, исходную версию, пути и критерии приёмки.

```yaml
id: audit-create-article-001
revision: 1
baseCommit: a935c55ee8ef0ba2bee65c0f7e69b4b205fe6163
assignedBy: orchestrator
returnsTo: orchestrator
mission: Проверить разделение обязанностей формы от маршрута до серверного действия.
ownerLayer: src/components/admin/documents/
role: .ai/roles/developer/frontend/INDEX.md
roleReason: Форма принадлежит frontend, а серверное действие входит в проверяемую границу вызова.
mode: static-read-only
requiredSources:
  - AGENTS.md
  - .ai/roles/developer/frontend/INDEX.md
  - .ai/rules/development/RULE-CODE-STRUCTURE.md
  - .codex/skills/feature-decomposition-guard/SKILL.md
  - .ai/checks/development/CHECK-CODE-STRUCTURE.md
  - documentation/specifications/realize-ai-control-panel/documents/creation.md
reviewScope:
  route: "src/app/(system-admin)/system/documents/actions/create/page.tsx"
  directory: src/components/admin/documents/
  files:
    - ArticleCreateForm.component.tsx
    - ArticleCreateField.component.tsx
    - ArticleCreateSectionFields.component.tsx
    - ArticleCreateForm.module.css
    - ArticleCreateForm.types.ts
    - DocumentArticleForm.types.ts
    - useArticleCreateForm.hook.ts
    - suggestDocumentIdentifier.util.ts
    - documentArticleInput.validator.ts
    - createDocumentArticle.action.ts
    - matchesSubmittedDocumentArticle.util.ts
permissions:
  read: [requiredSources, reviewScope]
  writePaths: []
  tools: [repo_read_file]
  output: reply-to-orchestrator
checks:
  - Определить владельцев JSX, поведения формы, стилей и типов.
  - Проследить отдельно создание статьи и проверку результата записи.
expectedOutput:
  - Карта обязанностей проверенных файлов.
  - Для каждого замечания — правило, путь, строка и влияние.
  - Пройденные проверки и ограничения статического чтения.
stopCondition: Вернуть оркестратору препятствие, если вывод требует недоступного источника.
```

В образце требуются все шесть источников целиком. Если достаточно раздела,
укажи его точный диапазон. В `permissions.read` входят пути источников,
маршрут и только перечисленные файлы относительно `directory`. Для задачи
с записью перечисли пути и разрешённые для каждого операции.

## Решение оркестратора

Заполни в контексте той же пары `id` и `revision` перед выдачей назначения.

| Что зафиксировать | Что сверить |
| --- | --- |
| По каждому источнику — путь, ожидаемый SHA-256, требуемый и подготовленный объём | До отправки текст в подготовленном контексте Realize совпадает с закреплённой версией и покрывает весь источник или все выбранные строки. |
| По адаптеру — исполнитель, попытка, фактические инструменты и границы доступа | Проверенная сессия или запрос обеспечивает все необходимые чтения и исключает дополнительные маршруты и операции. |
| Решение и причина | Обе проверки пройдены — `ready`. При невыполненной проверке укажи `blocked` и причину до запуска. |

Для допуска к аудиту оркестратор сверяет [подтверждение AdapterAccessEvidenceV1 для Codex и модели по API](../../../documentation/architecture/assignment-adapter/article-audit-evidence.md).

Если поручена только подготовка, верни готовое назначение для просмотра.
Для привязки сохрани в результате `contextId`, `assignmentId`, `revision`
и `lockSha256`. Получи подтверждения из повторно открытого контекста.
В данном образце начальный ввод содержит поручение и шесть источников;
единственному инструменту чтения доступны ровно 18 путей. Ответ оркестратору
содержит действующие права, подтверждение для каждого источника и причину статуса.
При запросе записи в режиме `static-read-only` исполнитель возвращает
предложение в отчёте. Попытку записи адаптер отклоняет до изменения файла,
а проверка в разрешённой области продолжается. Результат принимает `returnsTo`
по критериям назначения и фактическим доказательствам.

Для native collaboration достаточно сообщения. Профиль, выбор модели и поля
группы добавляй по применимости. Для managed external runtime используй также
обязательные поля writer/schema по [workflow сессии](../../workflows/core/worker-session/WORKFLOW.md).

## Приёмка аудита формы

Аудитор указывает роль каждого из 12 файлов области или причину пропуска,
прослеживает создание статьи и проверку результата записи. Для замечания
приводит правило, путь, строки и влияние. Статическое чтение подтверждает
выводы о коде; проверки браузера и БД отмечаются отдельно, если они нужны.

Независимый frontend-ревьюер сверяет карту обязанностей, обе цепочки и
ссылки на строки с теми же версиями файлов. Адаптер сообщает о прочитанных
диапазонах. О достаточности покрытия судит ревьюер. Оркестратор сопоставляет
отчёт и заключение с назначениями, проверяет обязательные результаты и
возвращает решение пользователю по [workflow независимого ревью](../../workflows/core/worker-assignment/WORKFLOW.md#независимое-ревью-аудита-формы-создать-статью).
