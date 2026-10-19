# Создание задачи и локальный резерв (`TEMPLATE-TASK`)

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
Этот шаблон применяется к самостоятельной задаче. Короткая самостоятельная команда
не требует `create`, пустого TASK или последующего close/archive; необходимые
служебные файлы инструмента размещаются по его контракту. Для действия
существующей задачи используй её серверную запись либо локальный резерв,
не создавая отдельное ради Git-доставки.

Подготовь краткое описание в существующем разрешённом файле, например в
`drafts/` текущей задачи. Передай его CLI из корня репозитория:

```bash
npm run task:workspace -- create \
  --task <localKey> \
  --project <projectUUID> \
  --title "<Название задачи>" \
  --body-file <existing-brief.md>
```

Выбери проект через `projects`, список — через `lists --project <projectUUID>`.
При настроенном подключении `create` требует `--project`; добавь `--list <listUUID>`, если список
не единственный. Старые Project/List env больше не выбирают контекст.
При ненастроенном подключении выбор можно отложить;
локальный резерв без него передаётся позднее явным `sync` с selectors.

CLI сначала создаёт задачу в настроенном Task Manager. При успехе TASK/manifest
не создаются. Локальное досье появляется только при ненастроенном подключении
или доказанной недоступности соединения; неизвестный исход требует точного
повтора. Переменные подключения, ошибки и `sync` описаны в
[CLI owner](../../tools/task-workspace/README.md#task-manager-и-локальный-резерв).

`localKey` — стабильный безопасный ключ запроса и резервной папки, например
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

Серверную задачу продолжай в Task Manager: её идентификаторы возвращаются `inspect`,
локальные команды после подтверждённой связи блокируются. Сохранённый TASK
резерва остаётся прежним снимком, а не актуальным серверным статусом.

Для существующего legacy `TASK.md` используй `adopt` только при явном принятии
его локального lifecycle, с выбранным
состоянием; body сохраняется. Unknown status и возраст не превращаются в
`done`, `closed` или `accepted` автоматически.

```bash
npm run task:workspace -- adopt \
  --task <localKey> \
  --title "<Название задачи>" \
  --category open
```

`--category active` выбирается явно, когда работа продолжается. Состояние
legacy TASK не выводится из текста автоматически. Передача существующего
managed досье в Task Manager выполняется явно через
`sync --task <localKey> --project <projectUUID>` и при необходимости `--list <listUUID>`.
Для повтора уже закреплённого запроса selectors можно опустить; смена известного
проекта, списка или API URL отклоняется.
Команда `adopt` сама по себе не импортирует задачу.

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

Серверную задачу обновляй через Task Manager в пределах реализованного
контракта `backlog/in_progress/review`. Локальные `done/closed` не являются
серверной приёмкой. Последовательность ниже относится к несвязанному локальному
резерву; после передачи на сервер его файлы автоматически не очищаются.

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
