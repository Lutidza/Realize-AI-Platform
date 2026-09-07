# Чеклист доработки рабочего слоя ИИ-агентов

- Дата аудита: 7 сентября 2026 года.
- Область: `.ai/**`, `.codex/**`, `AGENTS.md` и непосредственно связанные документы/инструменты.
- Цель: устранить противоречия и лишнюю работу, уменьшить расход контекста, сохранить качество и проверяемость результата.
- Статус: план сохранён; перечисленные доработки не считаются выполненными.

Основание — последний read-only аудит текущего рабочего дерева. В нём смешаны
сокращённые checks/skills и прежние обязательные rules/workflows. Более ранние
отчёты об оптимизации не являются доказательством состояния этого дерева.

Это план последовательных задач, а не новый источник исполняемых правил.
Сохранение файла не запускает реализацию пунктов автоматически.

## Как проходить чеклист

1. По следующему запросу выбирать один пункт, начиная с AI-01.
2. Перед его реализацией сверять текущее содержание перечисленных файлов и
   ограничивать изменения выбранной проблемой. Пути ниже — ориентиры, не
   разрешение на попутную правку всего каталога.
3. Менять связанный набор rule → check → skill → registry вместе, когда он
   затронут. Проверять прямые ссылки из roles/workflows/templates; не оставлять
   новую инструкцию рядом с противоположной старой.
4. Выполнять достаточные проверки выбранного изменения. Для Markdown — diff,
   ссылки и согласованность; для изменённого инструмента — его прицельные проверки.
5. Отмечать пункт выполненным только после реализации и проверки. Рядом кратко
   записывать результат, проверки и существенный остаток. Если пункт слишком
   велик, сначала разделить его на независимые части с сохранением связи с ID.

Не менять чужие незакоммиченные правки. Сохранять защиту secrets, auth/access,
DTO boundaries, миграции и generated artifacts. Browser evidence требуется,
когда вывод зависит от DOM/CSS/форм/взаимодействия. Продуктовые approval lanes
execution worker не ослабляются оптимизацией разработческих инструкций.

## Исходные наблюдения

| Показатель последнего аудита | Значение |
| --- | ---: |
| Активные Markdown-файлы без истории и документации tools | 177 |
| Их суммарный размер UTF-8 | 440 633 байта |
| Правила | 33 |
| Проверки | 43 |
| Workflow-документы, включая gates/states | 49 |
| Skills | 11 |
| Семь общих входных файлов до профильных материалов | 25 018 байт |

Размер текста не равен фактическим токенам, времени или стоимости работы модели.
Эти значения нужны для последующего сравнения одной и той же выборки.

## Этап 1. Единый порядок работы и авторизация

- [ ] **AI-01. Согласовать основной порядок выполнения задачи.**

  Проблема: system state machine и основной workflow задают разные цепочки;
  обычная задача смешивается с управляемым процессом и ручной приёмкой.
  Основные файлы: `.ai/system/state-machine.md`,
  `.ai/workflows/core/main-delivery/WORKFLOW.md`,
  `.ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md`, `AGENTS.md`.
  Готово, когда: прямой рабочий шаг имеет однозначный порядок; делегирование,
  специальный review, ручная приёмка и delivery имеют явные условия применения.
  Commit/push/deploy не следуют автоматически из завершения реализации.

- [ ] **AI-02. Устранить повторные согласования внутри разрешённой задачи.**

  Проблема: disposition/global/strict rules требуют отдельного approval, тогда
  как worker rules допускают необходимые обратимые правки внутри заданного scope.
  Основные файлы: `.ai/rules/scope-control/RULE-ARTIFACT-DISPOSITION.md`,
  `.ai/rules/scope-control/RULE-STALE-ARTIFACT-CLEANUP-AFTER-REFACTOR.md`,
  `.ai/rules/worker-runtime/RULE-WORKER-NO-SCOPE-EXPANSION.md`, global/strict rules
  и соответствующие checks.
  Готово, когда: новое разрешение требуется по риску и фактическому выходу за
  полномочия; уже полученная авторизация сохраняется. Явный read-only или
  пользовательский allowlist остаются обязательными границами.

- [ ] **AI-03. Объединить повторяющиеся отчёты о подготовке и review.**

  Проблема: global, strict, comment и command rules повторяют owner/scope/checks;
  `.ai/checks/pre-implementation/INDEX.md` требует вывод каждого check.
  Основные файлы: global/strict rules, `RULE-SAFE-COMMAND-PROPOSAL.md` в
  `.ai/rules/global/`, `.ai/checks/pre-implementation/INDEX.md`, связанные checks.
  Готово, когда: обычной задаче достаточно одной краткой записи подготовки и
  одного результата; обязательные машинные поля сохранены только там, где
  существует реальный consumer. Нет дополнительных language/history отчётов
  для обычного редакционного решения.

- [ ] **AI-04. Сократить обязательный маршрут чтения.**

  Проблема: `AGENTS.md` направляет через несколько индексов до профильного файла;
  сходные указания повторяются в README, roles, workflows и skills.
  Основные файлы: `AGENTS.md`, `.ai/README.md`, `.ai/system/INDEX.md`,
  `.ai/roles/role-groups.md`, `.ai/workflows/INDEX.md`,
  `.ai/registry/rules/INDEX.md`, затронутые skill entrypoints.
  Готово, когда: профиль выбирается по задаче; связанные материалы читаются по
  необходимости; неизменившийся уже прочитанный контекст не загружается повторно.
  Список `related_*` не означает обязательное чтение всего графа ссылок.

## Этап 2. Достаточные проверки

- [ ] **AI-05. Определить одного владельца политики проверок по риску.**

  Проблема: frontend-runtime-evidence и strict check ссылаются на отсутствующую
  матрицу в global/strict rules. Само существование файла не подтверждает наличие
  требуемого в нём контракта.
  Основные файлы: global/strict rules и check,
  `.codex/skills/frontend-runtime-evidence/SKILL.md`, frontend/backend self-review.
  Готово, когда: определены достаточные проверки для docs/comments, логики,
  API/DTO/auth, schema, UI и runtime/config; есть условия повторного и расширенного
  прогона. Недоступное evidence честно обозначается, а не заменяется словом passed.
  Полный CI сохраняется для своего назначения и не переносится на каждую правку.

- [ ] **AI-06. Согласовать профильные команды и применимость checks.**

  Проблема: backend skill предлагает отсутствующий `npm run generate:types`;
  некоторые checks требуют поля migrations/search/cache для любого backend diff.
  Основные файлы: `.codex/skills/payload-next-contracts-first/SKILL.md`,
  `.codex/skills/dto-contracts-first/SKILL.md`, `.ai/checks/development/**`;
  `package.json` используется как источник существующих команд.
  Готово, когда: команды соответствуют scripts, включая `payload:generate-types`;
  проверки и отчёт касаются затронутого поведения. Сохраняются позитивные и
  негативные сценарии auth/DTO, migration/generated contracts и browser evidence.

## Этап 3. Комментарии и структура кода

- [ ] **AI-07. Согласовать правило, check, skill и template комментариев.**

  Проблема: правило требует header и комментарий каждому export, check и template
  разрешают их отсутствие. В rule/skill используется отсутствующий `docs/**`.
  Основные файлы: `.ai/rules/development/RULE-CODE-COMMENT-DISCIPLINE.md`,
  `.ai/checks/development/CHECK-CODE-COMMENT-DISCIPLINE.md`,
  `.codex/skills/code-comment-discipline/SKILL.md`, его metadata,
  `.ai/templates/code-comments/TEMPLATE-TSDOC-FILE-HEADER.md`.
  Готово, когда: комментарии объясняют неочевидный контракт или причину; нет
  обязательных headers, дат, TSDoc каждому export и отчёта об отсутствии docref.
  License/tool directives и полезные пояснения сохранены. Массовая переделка
  комментариев приложения в этот пункт не входит.

- [ ] **AI-08. Отделить правку ссылки от изменения продуктового контракта.**

  Проблема: редакционная правка `@docref`/`@see` может запускать documentation
  gate и остановку из-за отсутствующей спецификации.
  Основные файлы: `.ai/rules/documentation/RULE-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md`,
  соответствующий check, `.codex/skills/skill-documentation-sync/SKILL.md`,
  comment skill.
  Готово, когда: изменение поведения синхронизируется с ближайшим реальным
  документом; исправление текста/ссылки само по себе не требует нового spec.
  Неясное продуктовое решение отделено от простого отсутствия документа.

- [ ] **AI-09. Убрать механические gates размера файла и imports.**

  Проблема: strict rule ограничивает 300 строк и `../`, а check/decomposition
  skill допускают их при подходящей структуре.
  Основные файлы: `.ai/rules/development/RULE-DEVELOPMENT-STRICT-PRINCIPLES.md`,
  соответствующий check, `.codex/skills/feature-decomposition-guard/SKILL.md`.
  Готово, когда: решение зависит от связности и ответственности; conventions
  приложения не навязываются всем packages/tools. Нет дробления, alias/loader
  migration или обоснований только ради формального ограничения.

## Этап 4. Делегирование и worker lifecycle

- [ ] **AI-10. Согласовать direct/native/external/managed режимы.**

  Проблема: worker rules и assignment разрешают native работу, session workflow
  и external skill запрещают её; search rule требует отдельную сессию для поиска.
  Основные файлы: `.ai/rules/worker-runtime/**`,
  `.ai/rules/development/RULE-SEARCH-SCOPE-DISCIPLINE.md`, соответствующие checks,
  `.ai/workflows/core/worker-assignment/WORKFLOW.md`,
  `.ai/workflows/core/worker-session/WORKFLOW.md`, external-worker skill и registry.
  Готово, когда: отдельные search-worker/coordinator нужны по полезному разделению
  работы; monitor/SQLite/preflight относятся только к выбранному managed режиму.
  Если обещан независимый review, его действительно выполняет другой агент.

- [ ] **AI-11. Исправить передачу результата и порядок завершения.**

  Проблема: external skill требует и запрещает передачу результата одному адресату;
  session workflow требует закрытый Dialog Assistant до итога и закрытие после него.
  Основные файлы: `.codex/skills/codex-external-worker-session/SKILL.md`,
  worker-session workflow, handoff/lifecycle rules и checks,
  `.ai/tools/agent-runtime/README.md`.
  Готово, когда: канал результата и порядок review/cleanup/ответа однозначны;
  реальные process handles, exit/result и lifecycle подтверждаются. Managed
  prerequisites сверены с кодом preflight, без выдуманных actors или статусов.

- [ ] **AI-12. Согласовать авторизацию worker-а, модель и runtime state.**

  Проблема: skill требует отдельный autonomous grant и фиксированные model IDs
  вопреки сокращённым rules; MCP rule запрещает state внутри `.ai`, где расположен
  managed store.
  Основные файлы: external-worker skill, `.ai/rules/worker-runtime/RULE-WORKER-MODEL-SELECTION.md`,
  `.ai/rules/agent-runtime/**`, `.ai/rules/external-tools/RULE-MCP-TOOLING-CONTOUR.md`,
  связанные checks и monitor defaults при фактическом влиянии на них.
  Готово, когда: полномочия сохраняются в пределах задачи; модель наследуется
  согласно ограничениям среды; persisted grants имеют отдельную применимость.
  Secrets/коммитируемые инструкции отделены от ignored generated state.
  Доступность конкретных моделей не объявляется без проверки.

## Этап 5. Актуальные владельцы, ссылки и инструменты

- [ ] **AI-13. Исправить маршрутизацию frontend и DTO к фактическим владельцам.**

  Проблема: AGENTS, roles, skills/checks требуют `src/ui/**`, `src/domain/**`,
  хотя canonical context и актуальный DTO rule указывают другие owners.
  Основные файлы: `AGENTS.md`, role mapper, frontend/backend rules/checks,
  `.codex/skills/dto-contracts-first/SKILL.md`,
  `.codex/skills/reference-to-implementation/SKILL.md`.
  Источники: `documentation/project-context.md`,
  `documentation/architecture/project-structure.md` и реальные файлы.
  Готово, когда: инструкции используют действующие feature/package owners;
  target/quarantined контуры не выдаются за active implementation. Запрет
  raw Payload leakage сохранён; приложение не реорганизуется ради старого skill.

- [ ] **AI-14. Исправить области поиска agent-search.**

  Проблема: 8 из 14 режимов содержат отсутствующие include paths; часть активных
  packages/services/UI owners пропущена. `--limit` обрезает только готовый вывод.
  Основные файлы: `.ai/tools/agent-search/bin/agent-search.mjs`, его README и
  search rule/check при необходимости синхронизации.
  Готово, когда: режимы охватывают существующие owners, область active/reference
  различима; поведение лимита явно описано или обоснованно изменено. Проверены
  dry-run и прицельные поиски затронутых режимов, совместимость CLI сохранена.

- [ ] **AI-15. Исправить экранирование печатаемой команды поиска.**

  Проблема: `shellToken` использует JSON escaping для shell-команды dry-run;
  копирование запроса с `$()` или обратными кавычками меняет его смысл.
  Основной файл: `.ai/tools/agent-search/bin/agent-search.mjs`.
  Готово, когда: пробелы, кавычки и shell metacharacters сохраняются буквально;
  прицельная проверка не исполняет содержимое запроса. Actual argv запуск и
  отображаемая команда согласованы. Этот пункт можно выполнить отдельно от AI-14.

- [ ] **AI-16. Убрать неработающие ссылки и синхронизировать registry/monitor.**

  Проблема: найдено 25 ссылок на пять отсутствующих документов, отсутствующий
  delivery coverage и незарегистрированное monitor rule. Monitor default
  allowlist содержит отсутствующий каталог спецификаций.
  Основные области: `.ai/registry/rules/**`, templates, runtime/monitor README,
  затронутые code comments; `.ai/tools/agent-monitor/src/components/OperatorCommandPanel.tsx`.
  Готово, когда: действующие ссылки разрешаются; реестр отражает реальные rules
  и условия применения; default allowlist не расширен без необходимости.
  Примеры, исторические ссылки и generated projections классифицированы отдельно;
  отсутствующий generated файл не считается автоматически ошибкой.

## Этап 6. Поддерживаемость слоя и итоговая проверка

- [ ] **AI-17. Сделать templates вспомогательными и убрать дублирование evolution.**

  Проблема: большие role/Markdown templates задают обязательные секции, тогда как
  INDEX template уже опционален; evolution workflow требует artifacts, отменённые
  его индексом и частью gates.
  Основные области: `.ai/templates/**`, `.ai/agents-evolution/INDEX.md`,
  `.ai/workflows/ai-operations/agents-evolution/**`, evolution role и sync skill.
  Готово, когда: обычная разрешённая правка не создаёт обязательную цепочку
  observation/proposal/applied; длительные предложения и история имеют явный
  смысл. Человеческие templates опциональны, используемые IDs и machine schemas
  сохранены. История не переписана под новое состояние.

- [ ] **AI-18. Проверить согласованность и измерить результат.**

  Повторно разобрать сценарии: docs typo, небольшой CSS fix, изменение auth/DTO,
  schema migration, native delegation, managed worker и авторизованный commit/push.
  Проверить ссылки, registry, metadata изменённых skills и отсутствие противоположных
  требований в прямых consumers. Git workflow уже содержит полезные scoped/SSH
  ограничения — не считать полный CI или runtime обязательными для каждого push.
  Готово, когда: для сценариев однозначны scope, полномочия, достаточные проверки
  и завершение; сравнен размер той же выборки инструкций. Экономия токенов/времени
  не заявлена как измеренная без сопоставимых реальных запусков.

## Bitrix / битрикс / Б24

- [x] **B24-AUDIT. Выполнен read-only поиск по текущему дереву.**

  Проверены имена файлов и 1 265 текстовых файлов, включая функционал и
  спецификации. Искались Bitrix/битрикс, B24/б24, BX24 и варианты с разделителями.
  Содержательных совпадений не найдено; совпадение внутри dependency integrity
  hash исключено как ложное. Secrets, private environment, DB/runtime dumps,
  Git history, dependencies и build/cache не исследовались как продуктовые тексты.

  Очистка по этому результату **не требуется в проверенной области**. Это не
  означает «Bitrix удалён»: удаление не выполнялось. Если в последующем шаге
  найдётся конкретный функционал или требование, сначала зафиксировать путь,
  consumers и необходимое удаление отдельной небольшой задачей. Упоминание здесь
  является записью результата аудита, а не продуктовым требованием.

## Прогресс

Следующий предлагаемый пункт: **AI-01**. Доработка инструкций ещё не начата.
Результаты последующих шагов записываются рядом с соответствующими пунктами;
отдельный журнал команд или отчёт на каждый gate не требуется.
