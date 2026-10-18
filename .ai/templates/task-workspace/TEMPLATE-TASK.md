# Вход в локальное досье задачи (`TEMPLATE-TASK`)

```yaml
template_id: TEMPLATE-TASK
template_type: task-workspace-entry-template
owner_layer: .ai/templates/task-workspace/
runtime_sources:
  - .ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md
  - .ai/tools/task-workspace/README.md
related_artifacts:
  - .ai/templates/markdown/TEMPLATE-AI-RUNTIME-MARKDOWN.md
  - .ai/workflows/core/main-delivery/WORKFLOW.md
```

## Создание (`create`)

Сначала выбери [рабочий контекст](../../rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md#выбор-рабочего-контекста).
Этот шаблон применяется к управляемому досье. Короткая самостоятельная команда
не требует `create`, пустого TASK или последующего close/archive; необходимые
служебные файлы инструмента размещаются по его контракту. Для действия
существующей задачи используй её досье, не создавая отдельное ради Git-доставки.

Подготовь краткое описание в существующем разрешённом файле, например в
`drafts/` текущей задачи. Передай его CLI из корня репозитория:

```bash
npm run task:workspace -- create \
  --task <localKey> \
  --title "<Название задачи>" \
  --body-file <existing-brief.md>
```

`localKey` — стабильный безопасный ключ папки, например
`2026-10-13-local-task-lifecycle-a4e8`. Повторяемый `--required-check <checkId>`
задаёт обязательные checks; `--acceptance-required` и `--delivery-required`
включаются, когда эти gates входят в критерии задачи. Не назначай их лишь
из-за наличия интерфейса или Git. UUID, revision и frontmatter создаёт tool
по публичному `@realize/payload-task-manager/workspace-contracts`.

Body должен быть кратким; достаточно следующих пунктов:

```markdown
## Цель

Ожидаемое поведение или результат.

## Область и ограничения

Owner; create/edit/delete scope; уже выданные полномочия.

## Критерии и проверки

Как подтвердить результат; обязательная приёмка/delivery, если требуются.

## Результат и ограничения

Ссылки на зарегистрированные материалы и result manifest; непроверенное.

## Следующий шаг

Конкретное действие для продолжения либо причина завершения/отмены.
```

## Продолжение (`inspect`)

```bash
npm run task:workspace -- inspect --task <localKey>
```

Для существующего legacy `TASK.md` сначала используй `adopt` с явно выбранным
состоянием; body сохраняется. Unknown status и возраст не превращаются в
`done`, `closed` или `accepted` автоматически.

```bash
npm run task:workspace -- adopt \
  --task <localKey> \
  --title "<Название задачи>" \
  --category open
```

`--category active` выбирается явно, когда работа продолжается. Состояние
legacy TASK не выводится из текста автоматически.

Команды `status`, `result`, `register`, `archive` и `reopen` изменяют существующее
досье с `--expected-revision <revision>`. Сложные входы передаются
через `--input -` для разового JSON либо `--input <JSON-file>` для имеющегося
файла. `--compact` сокращает ответ с сохранением ссылок; точные schemas и примеры принадлежат
[CLI owner](../../tools/task-workspace/README.md). После conflict сначала
перечитай досье. Если `inspect` показывает pending, используй
`recover --task <localKey> --operation <operationId>` по сохранённой ссылке;
не создавай другой cleanup-план и не меняй revision для обхода. Для старого
cleanup без planPath требуется исходный `cleanup --plan <original> --apply`.
У подключённой фикстуры диагностическая квитанция при pending остаётся в её
заранее зарегистрированном открытом retained/pinned дереве; metadata и settle
ожидают recovery. После потери handle заверши проверенные artifact IDs явно,
не восстанавливая process-local привязку из JSON.
Не правь machine frontmatter вручную.
`criteriaHash` фиксирует body целиком: после его изменения сдай свежий result
и повтори требуемую приёмку. Закрытое досье сначала переоткрывается явно.

## Завершение (`handoff`)

Заверши producers через `settle`, сохрани result manifest в `logs/results/`, фактические
checks, ограничения и execution refs. `done` не означает принятую задачу;
`closed` проверяет обязательные gates, отмена сохраняет причину и outcome.

Разрешённая очистка проходит через `plan-cleanup`, затем точно проверенный
`cleanup --plan <file> --apply`. Удаляется только зарегистрированный disposable
`tmp`; доказательства результата сохраняются заранее. Archive допускает
только закрытое quiescent досье и сохраняет evidence. Reopen не запускает runtime.
Полный контракт принадлежит
[правилу](../../rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md), порядок —
[main-delivery](../../workflows/core/main-delivery/WORKFLOW.md).
