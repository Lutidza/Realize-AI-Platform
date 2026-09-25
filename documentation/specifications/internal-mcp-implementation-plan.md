# Внутренний MCP Realize: план реализации

- Статус: **A+G+S1 и предустановки implemented; C подготовлен локально, облачная приёмка ожидается**, версия 0.6, 24 сентября 2026 года.
- Основной контракт: [спецификация и ТЗ](internal-mcp.md).
- Исходные факты и долг: [аудит проекта и ИИ-слоя](../reports/PROJECT-AI-MCP-AUDIT-2026-09-20.md).
- По последовательным разрешениям реализованы A+G и S1. Статус каждого этапа и ограничения приведены ниже; полный S и этапы B/P/C не считаются выполненными.

## 0. Фактическая поставка и evidence

M0–M5 и G1–G4 реализованы у владельцев ADR-0017: shared repository policy,
Git machine read, Pages facade, SDK HTTP composition и management registry/UI.
G5 предоставляет расширяемые descriptors и metadata records Next.js/Payload;
исполняемый внешний HTTP/stdio adapter пока не подключён. M6/M7 закрываются
адресными проверками и [эксплуатационным runbook](../architecture/mcp-tooling.md).

Проверено 23 сентября 2026 года:

- Exact Node 24.18.0/npm 11.15.0; official SDK server/node/client 2.0.0, Zod 4.6.5.
- Реальные SDK clients modern/legacy, HTTP auth/Host/Origin/body bounds,
  repository FS adversarial cases, Git index/worktree, binary omission,
  detached/unborn, полные hunks и cursor invalidation, standalone bootstrap
  без БД и SIGTERM; regression существующего Context Pack.
- Отдельная PostgreSQL 18.6/Payload: multi-instance list/filter, CAS race/replay,
  запрет self-issued developer grant, одноразовые tokens, rotate/revoke,
  desired/applied allowlist, port restart и boot replacement; Pages list/text/
  structure через SDK, свежие actor и Forms ACL, удалённый user и отмена занятого
  SQL с исправным pool. Закрытый pool запрещает managed auth; shutdown закрывает
  собственные connections, старый boot не изменяет receipt нового процесса.
- Native generated migration: все 21 up на пустой БД, empty down/up,
  populated down отказ `MCP_ROLLBACK_BLOCKED`. Generated types/importMap.
- Браузер: реальный Admin/API/listener, create/reload/enable/apply/discovery,
  dirty/CAS, issue/rotate/revoke без localStorage token; focus, light/dark,
  ширины 1440/390 без горизонтального overflow; `/admin` и отдельная установка
  с `/control`, back/deep link, empty/no-access, соседние integrations/settings.
  Это выполненные сценарии,
  не снимки макета и не mock API.
- Production build выполняет typegen → TypeScript → webpack Next build;
  все страницы сгенерированы. Локальные screenshots и логи находятся в задаче
  `.ai-workspace/tasks/2026-09-20-internal-mcp-audit-7c4e/` и не заменяют исходники.
- Итог: 156 integration tests, два browser запуска (стандартный и изменённый
  Admin prefix), TypeScript без incremental cache, lint/headers 90 исходников,
  Prettier и 91 относительная ссылка — pass. Собственные процессы остановлены,
  временные пути Next удалены из конфигурации проекта.

Тестовая установка изолирована от пользовательских БД; Compose PostgreSQL
15.18, эксплуатационная установка и реальные внешние adapters не проверялись.
Независимый reviewer не запускался; перечисленные проверки выполнены основным
агентом. В поставке 23 сентября `.codex/config.toml` не изменялся,
commit/push/deploy не выполнялись.

S1 реализован 24 сентября 2026 года: bounded source resolver у repository
owner, три строгих read tool contracts, общий capability catalog, маршрут
main-delivery/MCP workflow и Codex adapter. Реальные Markdown и SDK fixtures
проверяют ограничения, hash refresh, grants/revocation и fallback. Локальный
developer bootstrap установлен отдельной `realize-mcp.service`; Codex 0.154.0
подтвердил 9 tools и три S1 calls в ephemeral thread без model turn.
Прочитанный через клиент `AGENTS.md` совпадает с прямым файлом по bytes/hash.
UI/schema, продуктовый worker и managed Admin instance при S1 не менялись;
полная семантическая интерпретация правил не заявляется. Текущий приоритет по
уточнению пользователя — C: подключение именно ChatGPT к текущему проекту для
выполнения части задач в ChatGPT. Работа с Codex ведётся отдельно; S2 не нужен
для первого подключения и остаётся последующим расширением.

Финальные проверки S1: 60 tests в 6 suites, TypeScript без incremental cache,
адресный ESLint и 26 source/config headers — pass на exact Node 24.18.0.
Build, migration и browser UI повторно не запускались: Next/UI/schema S1 не
меняет; production web продолжает обслуживать ранее собранный A+G. Новые tools
у managed Admin instances потребуют обычного обновления сборки и явного apply.
Независимый reviewer не запускался; commit/push и внешний deploy не выполнялись.

## 1. Порядок и границы поставки

Цель программы — функциональный MCP системного рабочего слоя, через который можно довести разрешённую задачу от актуальных инструкций до проверенного результата и доставки. Чтение repo/Pages является техническим основанием A. Обязательное продолжение S добавляет реальные task writes, checks, agent lifecycle и управляемые изменения. B/P расширяют административные сценарии; ChatGPT не является главным критерием завершения.

Требование Admin входит в первую поставку: **A+G** включает действующий endpoint и раздел «MCP-серверы» с несколькими экземплярами, настройками, client access, проверкой и подтверждённым применением. Порядок реализации — M0, M1/G1, G2/G3, M5/G4 и совместная проверка. S1 выполнен; текущая следующая поставка — C по §13, S2–S5 остаются развитием системных возможностей. Подробности G — §16 плана и §19 спецификации.

```text
M0 — согласованные границы и инструкции
  ↓
M1 — версии, schemas, реестр и transport contract
  ↓
M2 — безопасное чтение/поиск файлов ─┐
M3 — read-only Git port            ├→ M5 — transport composition и lifecycle
M4 — Pages facade и actor         ┘       ↓
                                  M6 — protocol/security/domain verification
                                          ↓
                                  M7 — документация и клиентская приёмка A

M1 → G1 — multi-instance DTO/schema
       ↓
     G2 — management API, права и credentials
       ├→ G3 — действующий Admin list/detail
       └→ G4 — runtime config/status/protocol proof (после M5)
G3 + G4 + M6 → M7 — совместная приёмка A+G
G5 — добавление следующих типов/экземпляров через тот же registry

A → S1 — инструкции и capability discovery
      ↓
    S2 — task artifacts, checks, evidence
      ↓
    S3 — runtime coordination и настоящий executor
      ↓
    S4 — scoped patch, system-layer sync, разрешённая Git delivery
      ↓
    S5 — сквозная приёмка системного рабочего цикла S

A → B0 → B1 → B2 — управляемый page draft через DataOperation
A → P0 → P1 / P2 / P3 — административные возможности по owner gates
         P2 зависит от B для нового MCP-source
C — независимое подключение внешнего клиента после проверки auth/transport
```

M2, M3 и M4 можно вести независимо только после фиксации общих DTO, grants и ownership. Одновременная запись в общие exports/manifests выполняется последовательно ответственным агентом. Независимая проверка не подменяется самооценкой автора. Конкретный способ direct/native/external выбирается по действующим правилам, без обязательного monitor для native work.

Минимальный законченный выпуск A+G: A01–A15 и G01–G08, включая реальное чтение Pages, управляемую конфигурацию endpoint и Admin browser evidence на одноразовой локальной установке. Repository-only milestone пригоден для промежуточной проверки. A+G не закрывает задачу системной интеграции S: первый законченный системный выпуск требует S1–S5 и S01–S08. Этапы S3/S4 после своих prerequisite можно разрабатывать параллельно; номера обозначают понятный маршрут поставки, а не требование искусственно сериализовать независимую работу.

Для каждого семейства до исходников фиксируются strict schemas, grants/effects, owner, dependency availability, cancellation/replay и acceptance. До этого инструменты существуют только в целевой спецификации. Приоритет — замкнутые полезные сценарии; число tools само по себе не является результатом.

## 2. M0 — архитектурные решения и согласование рабочего слоя

**Ответственные:** Scope/Contour Owner, MCP Tooling Steward, Documentation Steward; Git owner для read port.

До исходников:

1. Зафиксировать цель A+G/S/B/P и критерии первого системного выпуска; принять отдельный loopback process, независимые development/runtime/installation grants, настоящий Payload actor и сохранение update ACL для Page context.
2. Оформить новый ADR в существующем `documentation/architecture/decisions/` с ближайшим свободным номером. Указать связь с ADR-0007, ADR-0015, ADR-0016 и главой 20. Не переписывать historical ADR.
3. Развести developer repository чтение и product gateway: статические инструкции `.ai/.codex` доступны только отдельному developer grant; private runtime, секреты и executable полномочия закрыты. Run/CR не фабрикуются ради чтения.
4. Описать narrow machine-caller port существующего deterministic Git handler. Разрешить только status/diff с server-owned root/scope, без LLM на каждый RPC. Согласовать исключение/границу в Git rule, workflow и README; обычные Git-команды development агента сохраняют текущий worker route. До принятия этого решения Git endpoint не реализуется обходом.
5. Подтвердить общий repository-policy owner: расширение существующего каталога CP, без копии allowlist и без импорта runtime entrypoint. Pages facade остаётся в Payload plugin.
6. Согласовать `.ai` coordination/search/monitor/workflow/skill drift SYS-01–04; обновить только непосредственно связанные владельцы, checks, registry и adapters. Optional managed mode остаётся отдельным выбором.
7. Исправить scoped search paths SYS-05–06 для текущих `src/packages/services/tests/scripts`; не превращать trusted agent-search CLI в защищённый MCP API.
8. Заменить отсутствующие обязательные ссылки SYS-07 существующими источниками; восстановить registry coverage SYS-08. Не создавать пустые исторические specs ради ссылок.
9. Устранить конкретный stale workflow paragraph ADM-01 в `project-structure.md`. Evolution/карты/header debt SYS-09–11 чинятся только при отдельно принятом scope; они не являются условием работы Pages read.
10. Привести локальный Node/npm к exact baseline без изменения guard. Для проверки текущего Git через development worker нужен заранее авторизованный REALIZE_GIT_CODEX_HOME; его отсутствие не обходится личным профилем.
11. Определить владельцев ещё отсутствующих task facade/check runner/patch port/general worker executor и trusted machine authorization. Переиспользовать `.ai` tool owners и существующие services; новый модуль создавать после scoped reuse scan. MCP composition root не получает копии бизнес-логики и самостоятельную универсальную БД.
12. Выбрать поддержанный executor S3 и границу изоляции S2/S4. Native bridge требует настоящего host API; при его отсутствии планируется внешний ограниченный executor. Описать recovery/receipts у владельцев и возможность выполнения задач без обязательного monitor.
13. Зафиксировать G у existing integration owner: provider mcp с несколькими instance keys, hosted/external union, раздельные outbound vault и inbound client verifiers, service receipt identity, management API и routes. ADR связывается также с ADR-0012; его текущее решение не переписывается как уже реализованный MCP registry.
14. Утвердить managed/bootstrap separation: нормальные настройки в Admin, operator ceilings/trust anchors вне UI, свежая managed authorization и fail-closed при недоступной config DB. Определить какие параметры применяются сразу и какие требуют реального restart acknowledgement.

**Выход:** принятый owner/trust boundary, конкретный allowlist файлов реализации, согласованные активные инструкции и документация. Новое состояние не объявляет MCP уже работающим.

**Проверки:** targeted references/registry consistency, отсутствие конкурирующих обязательных native/managed требований, search modes smoke, `npm run verify:runtime`. Изменение AI tooling source дополнительно требует headers и его адресных tests. ADR не заменяет техническую проверку.

**Остановка зависимой работы:** остаётся конфликт Git machine caller или protected-layer доступа. Независимая разработка schemas/fixtures продолжается в разрешённом scope.

## 3. M1 — зависимости и строгие контрактные схемы

**Ответственные:** Backend, MCP Tooling Steward.

**Владельцы:** root manifest/lock; предлагаемый feature `services/internal-mcp`; существующие AI DTO для Pages. Создавать только необходимые файлы.

1. Повторно проверить SDK/package versions, engines/peer dependencies и официальный protocol compatibility contract. Кандидаты на дату ТЗ: server/node/client 2.0.0 и Zod 4.6.5.
2. Установить выбранные exact совместимые версии штатным npm; не добавлять второй web framework, если достаточен официальный Node adapter. Не менять Node/Next/Payload ради MCP.
3. Зафиксировать modern 2026-07-28 и legacy 2025-11-25 stateless. SDK владеет JSON-RPC и version negotiation.
4. Реализовать config parser, Principal, общие bounded DTO, errors, cursors, input/output schemas и registry descriptors, связанный с handlers. Предусмотреть независимые domain/grant/effect/dependency поля для S/B/P; публиковать только реализованные и разрешённые tools.
5. Проверить существующие Page parsers: query trim ≤128, page 1–999999, text ≤128 fields/64 KiB плюс knowledge ≤48 KiB; не вводить несовместимые limits.
6. Определить общий UTF-8 wire budget и consistency правил `truncated/nextCursor/reason`; неизвестные input keys запрещены.

**Проверки:** позитивные/негативные schema cases, empty/EOF/Unicode/safe integer/oversized input; registry names и annotations соответствуют фактическим operations. Typecheck и dependency compatibility smoke.

**Готовность:** существующие consumers компилируются; контракт каждого tool определён без raw Payload и arbitrary args; никакой endpoint ещё не объявлен production-ready.

## 4. M2 — общий repository read/search owner

**Ответственный:** Backend с security review.

**Область:** `services/ai-control-plane/src/projectContextCatalog.service.ts` и необходимые feature modules рядом; текущие Context Pack consumers; соответствующие tests. MCP transport не получает вторую policy.

1. Разделить проверку разрешённости логического пути и открытие существующего файла. Policy должна работать также с index/deleted Git paths.
2. Добавить проверяемое разрешение README.md и уточнить static `.ai/.codex` против всех runtime/session/private outputs. `.env.example` только явным безопасным исключением.
3. Сохранить realpath/O_NOFOLLOW/inode/dev/hardlink/UTF-8/size protection; hash считать от тех же bytes.
4. Добавить bounded list/depth, point read/ranges, literal content search и детерминированную сортировку. Не вызывать старый collect всего проекта на каждый point read.
5. Реализовать stateless authenticated cursor. Search cursor связан с content hashes, а не только именами; после изменения snapshot — CONFLICT. Не хранить бесконтрольно snapshot cache.
6. Ограничить scan entries/bytes, запрос/response, timeout и фактически выполняющееся I/O. Nested repositories/submodules и специальные files исключены.
7. Сохранить прежний Context Pack contract и его тесты; расширение общей политики не должно ослабить старый consumer.

**Проверки:** временные репозитории/каталоги, traversal/absolute/UNC, file/directory symlinks, hardlinks, changing file/parent, UTF-8/NUL, binary, generated/runtime/secrets, empty/large line, cursor tamper/expiry/restart/content-change, cancellation и budget. Проверить все file tools одной матрицей forbidden paths.

**Готовность:** безопасные unit/API-level операции работают без Payload/модели; существующий Context Pack regression проходит. MCP protocol proof ещё не заявляется.

## 5. M3 — безопасный Git read port

**Ответственный:** Git handler owner; проверка другим Backend/MCP reviewer.

**Зависимость:** M0 machine-caller contract и M1/M2 path/DTO policy.

**Область:** `.ai/tools/git-delivery/src` и его public read entry, соответствующие tests, правила/документы только в согласованной части. Не импортировать весь worker runner в MCP.

1. Экспортировать узкий детерминированный read interface. Handler не принимает модельные root/action/auth flags и не предоставляет commit/push.
2. Применять точный allowlist до snapshot/read; `scope=all` с post-filter не допускается.
3. Дополнить status pagination и DTO без absolute Git paths/remote/identity secrets.
4. Добавить отдельный index/worktree diff с no-ext-diff/no-textconv, безопасным environment и subprocess timeout/output cap.
5. Определить head/index/working_tree/absent identities, deleted/unborn/conflict/binary/untracked semantics. Cursor продолжает полные hunks на одном snapshot.
6. Не использовать captureWorktreeDiff/add -N. До/после вызова сравнить index/ref и working-file fingerprints.
7. Проверить запуск/отмену child, Linux/flock assumptions и отказ write action до subprocess.

**Проверки:** temp Git repo с исходными staged/unstaged/untracked/renamed/deleted/conflict состояниями; detached/unborn; secrets в index/deleted/rename; shell metacharacters/pathspec; malicious diff/textconv/fsmonitor; concurrent change HEAD/index; pagination complete hunks; timeout и повторный запрос.

**Готовность:** ни одна read операция не меняет index/ref/checkout и не читает запрещённые bytes; существующие development worker inspect/commit/push contracts проходят относящиеся regression tests. Git-проверки выполняются разрешённым механизмом; тесты не используют ценный рабочий индекс.

## 6. M4 — Pages server facade и настоящая identity

**Ответственный:** Payload Backend; host owner `src/collections/Pages` подключается при изменении adapter boundary.

**Область:** `packages/payload-ai-plugin` server facade/export, существующие Page services/parsers и host bootstrap; без новой предметной модели.

1. Проверенный managed MCP credential связывать с конкретным Users.id через G client/actor mapping; права перечитывать при каждом вызове. Repository grant и Pages grant независимы; bootstrap mode installation grants не принимает.
2. Создавать настоящий PayloadRequest; сохранять permission callbacks, Page update ACL для text/structure и ACL связанных forms. Никакой искусственный admin/overrideAccess.
3. Экспортировать list/text/structure через узкий `./server/*` entry существующего package. Не копировать mapping и не использовать AIRun-bound callback.
4. Отделить чтение от provider readiness: A работает без Codex connection, сохраняя data/actor checks. Это узкое изменение service boundary, не отключение chat gates.
5. Лениво загружать host config по существующему Media bootstrap pattern; до import отклонять PAYLOAD_DB_PUSH=true, использовать cron:false, не запускать jobs/seed/migrations. Repository-only режим не инициализирует Payload.
6. Ограничить query/connection/advisory lock ожидание, корректно откатить собственную транзакцию при timeout, закрыть Payload instance при shutdown.

**Проверки:** existing Pages suites плюс facade identity/ACL/DTO tests; отсутствие provider secret; удалённый user/revoked admin/customer; два законных admins читают общую страницу; попытка actor injection; Forms ACL; oversized text/knowledge; DB unavailable; занятый другим connection advisory lock; startup/abort/shutdown не пишут schema/jobs.

**Готовность:** на disposable PostgreSQL list → read → structure показывает реальную страницу и сохраняет действующие ACL. Mock-only тесты не заменяют этот результат. Readiness живой пользовательской БД не предполагается.

## 7. M5 — HTTP composition, auth и завершение процесса

**Ответственный:** Backend/MCP Tooling Steward.

**Область:** новый `services/internal-mcp`, root `mcp:serve`, пример bootstrap/managed конфигурации без секретов. G2/G4 подключают per-instance configuration и credentials; auto-start dev/Compose/deployment не добавляется.

1. Собрать официальные SDK handler/Node adapter и единый registry поверх проверенных ports.
2. Bind только 127.0.0.1, configured port; точные Host/Origin guards, bearer auth до SDK, body limit, no proxy trust.
3. Поддержать modern и legacy stateless одним registry; не добавлять свою JSON-RPC или session store.
4. Health без private данных; authorized context показывает реально настроенные/недоступные модули, без фиктивного успеха.
5. Request IDs, безопасные logs, global/principal concurrency, rate/size/time limits; cancellation освобождает реальные ресурсы.
6. SIGINT/SIGTERM, grace 5 секунд, close listener/собственных child/DB; повторный запуск и понятные startup errors.
7. Разделить bootstrap env auth и managed instance/client authorization. Настройки из Admin не могут заменить root/command/operator ceiling; config DB unavailable не активирует bootstrap. Реальный listener сообщает применённую revision через G4 owner receipt.

**Проверки:** A01–A05, A11, A14; invalid config до listener, auth/revocation, bad Host/Origin, no-Origin CLI, malformed/unknown protocol, unavailable dependency, signal during startup/call и освобождение порта.

**Готовность:** локальный endpoint работает независимым процессом, каждый опубликованный handler доступен только своему principal. Наличие HTTP 200 не считается protocol proof.

## 8. M6 — интеграционная и негативная приёмка

**Ответственный:** независимый проверяющий; исправления возвращаются владельцу соответствующего модуля.

Пройти A01–A15 полностью. Нужны минимум три группы fixtures:

- Реальные SDK clients: modern с явно включённой negotiation/pin, legacy с initialize; проверенные version/era и Calls.
- Временные настоящие Git repos/FS: path policy, bytes/hashes, staging invariance, пагинация и resource limits.
- Одноразовая PostgreSQL/Payload установка: реальный actor, Page/Forms ACL, content parity, transaction lock timeout и отсутствие writes в A.

Негативная матрица обязана включать bad token/Host/Origin, unsupported version, unknown method/tool, extra fields, malicious paths/cursors, forbidden bytes во всех пяти repository tools, Git external handlers и попытку write action. Ошибка одного tool не завершает сервер.

Существующие regression suites из аудита запускаются один раз после относящегося diff. При новых изменениях/ошибках повторяются затронутые проверки; успешные несвязанные проверки не гоняются бесконечно.

**Готовность:** таблица A01–A15 заполнена фактическим результатом и безопасным evidence. Не пройденный обязательный сценарий указан как незавершённая часть, а не waived «по наличию кода».

## 9. M7 — документы, клиент и передача выпуска A+G

**Ответственные:** Documentation Steward, MCP Tooling Steward, основной агент.

1. Обновить `documentation/architecture/mcp-tooling.md`, `project-context.md`, `project-structure.md`, root README и актуальную спецификацию по фактическому diff. Добавить runbook в существующий delivery owner только когда появляется действующий способ запуска.
2. При изменении принятой архитектуры оформить ADR linkage; не превращать audit snapshot в активное правило.
3. Добавить project MCP entry в `.codex/config.toml` только после protocol proof и в разрешённом scope, с env token reference. Синхронизировать перечни server в `.codex/README.md` и `.codex/STRUCTURE.md`. Выполнить обязательный MCP self-scan по workflow: ссылки и stale assumptions в `.ai`, `.codex`, документации; проверить прямых role/rule/check/workflow/registry consumers и зафиксировать sync_required. Обновлять только действительно затронутые связи, не создавать новое правило ради server. Не зеркалировать session plugins.
4. Подключить фактически используемый локальный клиент, вызвать каждый разрешённый tool, проверить описания/аннотации/ошибки и ограничения. Секреты в screenshots/logs не сохранять.
5. Передать команды, URL, имена env, список реально работающих tools, проверки, ограничения и возможность отключить process. Секреты не возвращать в отчёте.
6. Завершить свои workers/processes по фактическому backend lifecycle. Отсутствие managed runtime не маскировать synthetic SQLite records.

**Готовность:** M6 и G1–G4 пройдены; документация описывает реально проверенную первую поставку A+G, рабочий Admin раздел и незавершённый scope S/B/P. ChatGPT интеграция отмечена отдельным этапом. Commit/push/deploy выполняются только при отдельном разрешённом действии.

## 10. Выпуск S — полноценный системный рабочий цикл

Первый предметный сценарий совместных S2/S4 —
[Мастерская дизайна, W1–W3](design-workshop.md#delivery): доработка референса
через GPT с сохранением версии, проверками и preview. Это использует общий
server-owned workspace binding; отдельный упрощённый write в основной checkout
не является промежуточной реализацией S4. Остальные части выпуска S сохраняют
свои границы и критерии; наличие инструкций Мастерской не означает готовый runtime.

### S1. Правила, контекст и выбор инструментов

**Статус: implemented, 24 сентября 2026 года.** `ai_context_resolve`,
`ai_instructions_get`, `ai_capabilities_list` доступны developer principal.
Hash-bound чтение, ошибки источников, явный `needs_review`, capability/grant
refresh и отключённый MCP проверены fixtures; реальный Codex client проверен
отдельно. Managed clients должны явно получить новые имена tools с обычным
apply; старые allowlists автоматически не расширяются. Запуск локального
bootstrap не означает управление этим процессом через Admin.

**Владельцы:** `.ai` policy/registry owners, `.codex` adapters, MCP Tooling Steward; resolver размещается по принятому в M0 owner decision.

1. Реализовать bounded resolver AGENTS → global/profile rules → owners/workflows/checks/skills. Возвращать source paths/hashes/authority, coverage, missing refs и conflicts; не утверждать автоматическую разрешимость всех prose-инструкций.
2. Связать capability discovery с реальными handlers/grants/dependencies. Предусмотреть refresh после policy/permission change, безопасную выдачу недоступности и отсутствие приватных сведений чужой области.
3. Подключить MCP как штатный маршрут bootstrap/context в main-delivery и непосредственно затронутых roles/skills. `.ai` остаётся policy source, `.codex` — adapter; schemas не копируются в каждый Markdown.
4. Проверить direct fallback при выключенном MCP. Отдельно проверить, что task notes/Pages/tool output не становятся системной инструкцией и не выдают permissions.

**Готовность:** S01/S07/S08; тот же набор источников доступен через MCP и напрямую, противоречия не скрыты; отсутствие MCP не блокирует чтение AGENTS.md.

### S2. Task artifacts, проверки и evidence

**Владельцы:** task-workspace policy и узкий новый facade, существующие source-headers/scripts/tests owners; bounded runner по решению M0.

1. Реализовать server-owned binding principal → task → workspace → разрешённые paths. Context/repo/Git reads, patch/check, worker assignment и delivery должны работать с тем же workspaceBindingID; schemas/cursors/evidence связываются с ним. TASK.md ведёт один coordinator, workers пишут в выделенные области. Добавить bounded read/write/CAS и durable receipt без общей таблицы продуктовых Tasks.
2. Подготовить executable check profiles поверх существующих команд: runtime, explicit-file headers, typecheck, targeted tests/lint; остальные подключать с их требованиями. Manual check всегда остаётся явно manual.
3. Задать trusted cwd/workspace, аргументы по schema, безопасный env, network/filesystem/resource policy, разрешённые outputs. Запуск тестов считать исполнением кода; запретить generic shell/npm-script и не наследовать пользовательскую `.env`.
4. Реализовать actual child lifecycle, timeout/cancel/status, сохранение exit/evidence/input fingerprints. Начинать с маленького проверяемого профиля; не объявлять все check документы исполняемыми.
5. Обеспечить restart/replay/interrupted recovery и handoff с реальными references/hashes. Создание evidence не означает автоматически успешную проверку или независимый review.

**Готовность:** S02/S03/S07; check реально проходит и падает на fixtures, cancellation завершает принадлежащий runner child, повтор после crash не удваивает исполнение. Изменившийся input помечает evidence stale. Чужие artifacts/secrets недоступны, автоматической очистки по возрасту нет.

### S3. Managed coordination и исполнение agents

**Владельцы:** `.ai/tools/agent-runtime`, active lifecycle/coordination owners, Codex adapter/внешний launcher по принятому контракту; native host bridge только при доступном API.

1. Открыть безопасный read facade runtime: readOnly + initialize:false, scoped DTO/pagination, `not_initialized` без записи при отсутствующей БД. Не отдавать raw snapshot/messages metadata/SQLite.
2. Добавить typed session/job/group/message/acceptance handlers через existing writer. Principal/session/role/action grants серверные. Поля actor-role/command/options из модели не передаются generic dispatcher.
3. Сохранить реальные значения request_worker/request_status/stop: requested/delivered не равны launched/responded/terminated. Result acceptance — отдельная запись; она не утверждает human product approval.
4. Реализовать хотя бы один настоящий general worker executor: bounded assignment, preflight, профиль/credentials isolation, real handle, output/result, timeout/cancel, join и cleanup. При native bridge использовать host handles; при отсутствии — ограниченный внешний backend. Product execution worker не превращать в обход developer permissions.
5. Для managed service start/reuse использовать существующий lifecycle; maintenance preview/apply отделить по grants, paths/ports фиксировать сервером, unresolved rows сохранять. Неподдержанный service stop не публиковать.
6. Проверить orphan/restart recovery, crash между request и фактическим launch, чужой process/session, ошибку provider и реальную остановку. Не создавать synthetic native sessions.

**Готовность:** S04; полный реальный lifecycle одного supported backend, негативная проверка native unavailable, monitor не требуется direct/native режиму. До готовности executor S3 обозначается частично выполненным, даже если все dispatcher calls работают.

### S4. Разрешённые изменения и Git delivery

**Владельцы:** development file operations, затронутые source/docs owners, Git delivery; правила system changes принадлежат `.ai`.

1. Выбрать изолированную task workspace и механизм владения записью. Hash-check + rename не считать полноценным CAS произвольно редактируемого checkout. Для нового Git worktree lifecycle нужен отдельный узкий owner contract: действующие inspect/commit/push его не реализуют.
2. Добавить changes_prepare с exact paths/hashes/patch, preview, impacted checks и change receipt. Реализовать apply/status/recovery, не теряя чужие changes; crash/частичное применение возвращают честный state.
3. Разделить обычную source.write и system-instructions.write. Для `.ai/.codex/AGENTS.md` нужны разрешённый task scope, canonical owner и связанные registry/check/workflow/skill sync. Markdown change не расширяет собственные server grants.
4. Сохранить generated-file запрет; генераторы подключать известными check/action profiles. Delete/rename допускаются только в явно заданных границах, а не через универсальный cleanup.
5. Связать git_delivery_prepare/execute/get с действующим restricted worker/handler, разрешением точного action, paths/revision, evidence и destination. Если выбран новый machine caller, предварительно принять его правило/ADR и проверить эквивалентность authority.
6. Проверить чужое staging, concurrent edit, policy/grant revocation, restart/replay, commit прошёл до disconnect, неоднозначный push outcome. Никаких автоматических force/reset/clean/merge/deploy.

**Готовность:** S05–S07, полный безопасный цикл исправления и проверок с S2. Доставка проверяется на временном репозитории/локальном remote; реальные commit/push текущего проекта не требуются для такой приёмки и выполняются только по отдельному разрешённому действию.

### S5. Сквозная приёмка и внедрение в рабочий слой

Пройти S01–S08: начать/продолжить task → получить актуальные rules → исследовать реальные files → подготовить/apply разрешённый patch → выполнить check с failure и исправлением → получить independent worker result → handoff → отдельно разрешённая Git delivery. Проверить отключение MCP и каждой независимой зависимости, restart, stale evidence, чужой task/actor и отсутствие self-approval.

Синхронизировать фактически затронутые AGENTS/main-delivery/roles/checks/skills/registry/.codex config и architecture/runbook. MCP self-scan выполняется повторно по итоговому contour; deprecated CLI routes не удаляются без отдельного решения о миграции. Добавить короткие рабочие сценарии и ограничения по поддержанным backend.

**Готовность:** новая сессия агента выполняет полный системный сценарий через MCP по актуальным инструкциям; требования остаются доступны при fallback. A без этого результата называется техническим основанием, не завершённой интеграцией.

## 11. Выпуск B — подготовка записи через DataOperation

### B0. Provenance, ownership и UI contract

Принять MCP-source discriminator без фиктивного conversation/AIRun, source-aware authorization всех read/decision/apply/rollback/replay routes, discriminated public DTO и Admin entry для просмотра операции. Уточнить migration/rollback strategy для обязательных ныне conversation/sourceMessage. Сохранить enabled Codex + tools.dataOperations gate человеческого approve/apply либо отдельно согласовать его изменение.

**Gate:** ни один существующий assistant/workflow source не теряет обязательную связь или ownership. Header/source/docref и schema checks выполняются по реальному diff.

### B1. Durable prepare и получение результата

Реализовать `pages_prepare_draft` и owned `pages_get_draft_operation` через существующего DataOperation owner. В transaction связать создание операции, canonical request hash, key namespace и durable результат. Tool prepare возвращает awaiting_approval, не page created. MCP не получает approve/apply authority.

**Gate:** same-key/same-payload replay, same-key/different-payload conflict, конкуренция, crash/restart, role revocation, credential rotation и другой actor проверены на настоящей одноразовой БД. Проверены реальные Admin confirmation/apply и page ID после применения; повторы не создают второй draft.

### B2. Приёмка и восстановление

Проверить Data Lane access/hooks/audit/outbox/optimistic lock, TTL и отменённую/отклонённую операцию, отдельное rollback approval и точное восстановление. Добавить browser evidence новой Admin карточки, проверки UI защиты ввода и source-specific ownership. Publication/delete/code jobs остаются вне B.

**Gate:** end-to-end MCP prepare → human Admin approval → apply → read saved draft → owned status. Durable idempotency не объявляется доказанной по in-memory map или mocked transaction.

## 12. Выпуск P — административные функции установки

### P0. Read facades и диагностика

Экспортировать узкие domain facades Config, owned conversations/runs/workflow checkpoints, DataOperation, Code Lane status/evidence и redacted integration readiness. Сохранить разные callbacks: Config manager, chat user, integration manager. Installation-wide Config не превращать в conversation-owned объект.

Для history использовать persisted DTO; stateful run event stream не оборачивать как read-only. CP active Map не объявлять durable. Status/readiness не вызывает модель и не включает provider tools по умолчанию.

**Готовность:** P01 и негативная isolation matrix, отсутствуют DB writes у read tools; отсутствующая модель не блокирует чтение сохранённой истории, приватные vault/logs не раскрыты.

### P1. Config lifecycle

Открывать по порядку draft create/replace → validate → release. `validate` сохраняет state/revision/event и требует write contract. Сохранить CAS, immutable release, system/compiled hashes и durable actor/action-scoped replay; не добавлять raw artifact CRUD.

Activate/rollback сначала доступны как handoff к существующему Admin действию. Их прямой machine execution требует принятого trusted action authorization: сегодня отдельного human approval aggregate нет. Сохранять exact pointer version/release hash и факт, что activation не меняет старые run snapshots.

**Готовность:** P01/P02, race/replay/revocation tests; release не активируется автоматически, модельный approved:true не заменяет доверенное разрешение.

### P2. Data Lane и workflow

После B подключать отдельными контрактами Page text/structure/category prepare, чтение decision и execution после уже сохранённого human approval. Approval tools в канал модели не добавлять. Распространить новый source на все ownership/replay/rollback пути и сохранить provider gate либо явно изменить его отдельным owner решением.

До Pages workflow действий воспроизвести ADM-02 failing regression, исправить соответствие intent/check у существующего owner и добавить cases для реально поддержанных capabilities. Start фиксирует выбранный active compiled snapshot; continue сохраняет immutable configuration snapshot родительского run, exact checkpoint и single-child semantics. Текущие actor ACL/runtime gates проверяются заново для start/continue/cancel; awaiting_input не подменяется фиктивным ответом пользователя.

Publication/restore/delivery добавляются отдельными specialized actions: собственные ACL/source/hash/approval и реальные внешние effects. Наличие этих сервисов не делает их автоматически workflow capabilities.

**Готовность:** P02/P03, disposable DB end-to-end, browser evidence изменённого Admin flow и restart/concurrency tests; неизменны ACL/hooks/audit/outbox и optimistic locks.

### P3. Code Lane, preview и продвижение результата

1. Дополнить protected execution policy: отдельный regression для AGENTS.md и directory scopes, закрыть статический gap до выдачи MCP execution grants.
2. Принять MCP provenance для change plan: текущий create требует настоящие assistant sourceMessage и preceding user request. Расширить downstream DTO/ownership/review без фиктивных сообщений.
3. Использовать existing approved plan → signed scoped job → durable queue/claim → isolated worktree. MCP не запускает дополнительный Codex поверх штатного worker.
4. Выдавать diff/check/review evidence и разрешённый enqueue preview после implementation acceptance. Independent review/checks — стадии существующего worker, не обещанные произвольные rerun APIs.
5. Сохранить human implementation/preview/release acceptance, artifact/commit hashes, expiry, readiness и destination. Подготовка release, его approval и публикация draft PR — отдельные действия. Release approval не равен production deploy; PR publication не равна merge.
6. Если требуется cancel execution/preview/release/source-promotion job, сначала реализовать отдельный owner contract с request/acknowledgement, cleanup/recovery. Публичной job cancel команды сейчас нет; AIRun cancel и worker timeout не используются как её подмена. До реализации tool не публикуется, status указывает unsupported cancellation.

**Готовность:** P01–P03 и существующие Code Lane gates, negative protected-layer/source/approval tests. Внешняя публикация подтверждается отдельным разрешённым сценарием; успех local preview не даёт такого разрешения.

### P4. Использование внешних MCP встроенными агентами

Зависит от G registry/discovery и отдельного решения о consumer policy. Текущий Codex adapter принудительно отключает MCP и отвергает mcpToolCall. Сохранённое подключение не снимает этот запрет.

Реализовать узкий consumer bridge с actor/run/config/instance binding, reviewed tool/schema allowlist, budgets/timeouts/cancellation и audit. Outbound credentials разрешаются по текущей connection revision у vault owner. Scope встроенного агента ограничивается его прежним capability ceiling; server descriptions/annotations не становятся политикой. Возврат больших или вредоносных результатов не выдаёт доступ к `.ai`/secret/env. Прямое изменение `mcp_servers={}` без этого контракта не считается интеграцией.

**Готовность:** реальный поддержанный external server вызывает только разрешённые tools для конкретного run; revoke/disable/schema drift и чужой instance закрыты. UI отражает, каким consumer connection действительно доступен. Без bridge состояние остаётся «Не подключён к этому агенту», без фиктивного успеха.

## 13. Следующий этап C — ChatGPT

Локальная реализация включает отдельный managed instance на loopback 4320,
предустановки и форму ChatGPT в Admin. Tunnel ID, write-only OpenAI key, grants
и срок задаёт клиент установки. Существующий vault шифрует credentials отдельно
для каждого экземпляра; managed supervisor применяет настройки и ведёт official
tunnel-client. Оператор задаёт только доверенный executable/master key/host
ceilings. Ручные клиентские env-файлы заменены этим процессом.

Предустановки добавляются при manager login/явной установке, отключены по
умолчанию и не перезаписывают изменения. Bootstrap Codex на 4319 сохраняется.
Детали — в [runbook](../architecture/mcp-tooling.md#обычный-chatgpt-текущая-локальная-подготовка).

Проверены SDK discovery, capabilities/context/README и отказ без ключа.
Private tunnel использует общий выбранный principal для участников workspace.
Public HTTPS/OAuth требует отдельного identity mapping.

Открытая приёмка C: пользователь вводит созданный runtime key в Admin,
подтверждает workspace association и выполняет реальные tools calls из обычного
ChatGPT. Локальные проверки и Codex-вызовы не заменяют облачную приёмку.

## 14. Матрица команд и доказательств

Команды выполняются из корня, в подготовленной локальной среде. Ниже существующие команды; новые MCP suites/commands появляются в своих этапах и до этого не считаются доступными.

```bash
npm run verify:runtime
npm run typecheck -- --incremental false --pretty false
DOTENV_CONFIG_PATH=/dev/null npm run test:int -- tests/int/control-plane-context.int.spec.ts tests/int/pageDraftContracts.int.spec.ts tests/int/pageDraftUpdateContracts.int.spec.ts tests/int/pageDiscoveryContracts.int.spec.ts tests/int/pageDraftChatContext.int.spec.ts tests/int/pageDiscoveryPlugin.int.spec.ts tests/int/workflowDataLane.int.spec.ts tests/int/ai-config-api.int.spec.ts tests/int/ai-config-activation.int.spec.ts
```

| Изменение                          | Дополнительная проверка                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Исходники/исполняемая конфигурация | `npm run check:headers -- <конкретные изменённые файлы>`; targeted ESLint через установленный бинарник                  |
| Git port                           | Существующие handler regression + новые temp-repo read tests, не рабочий индекс                                         |
| SDK/transport                      | Новые protocol suites обеих eras и реальный процесс; SDK client обязателен                                              |
| Pages facade                       | Disposable DB tests; реальные ACL и lock deadline                                                                       |
| Schema выпуска B                   | Штатные Payload migration/type generation commands по package.json, проверка migration apply/rollback на одноразовой БД |
| Admin UI выпуска B                 | Browser evidence по frontend-runtime-evidence, подходящие e2e                                                           |
| Next или package build boundary    | `npm run build` с безопасно настроенным окружением; full CI согласно policy выпуска                                     |
| Markdown/docs                      | Проверка относительных ссылок, фактов, статусов Draft/Current и форматирования конкретных файлов                        |
| S1 registry/context resolver       | Real Markdown fixtures, missing/conflicting source, hashes/coverage, prompt injection и offline fallback                |
| S2/S3 task/check/runtime           | Temporary task/runtime roots, read без init, настоящий process exit/cancel/restart, scoped grants и отсутствие секретов |
| S4 patch/delivery                  | Isolated workspace, concurrent writer, partial/crash recovery, generated/protected paths и temp Git/remote              |
| P Config/Data/Code Lane            | Current owner regression, actor/source/replay/approval matrix, disposable DB и browser только для изменённого UI        |

`DOTENV_CONFIG_PATH=/dev/null` подходит только перечисленным pure/mock/temporary-FS suites. Настоящие DB protocol tests получают специально подготовленный одноразовый env; не подставлять production/local user DB без явного контекста. В outputs и логах не сохранять connection strings/tokens.

Факты текущего анализа: typecheck и 161 тест прошли; verify:runtime failed; MCP suites, live DB и browser не запускались. Эти результаты служат исходным evidence, не автоматическим зачётом будущего diff.

## 15. Работа с выявленным долгом

| Долг                                                 | Связь с реализацией                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| SYS-01–04 native/search/managed conflicts            | Уточнение действующих инструкций в M0 до исполнения нового процесса                                                   |
| SYS-05–08 search paths/refs/registry                 | Адресная синхронизация рабочего слоя; старый CLI не экспортируется MCP                                                |
| SYS-09–11 evolution/maps/legacy headers              | Отдельный scoped follow-up или изменение затронутого файла по необходимости                                           |
| ADM-01 stale workflow docs                           | Узкая синхронизация текущих фактов в M0/M7                                                                            |
| ADM-02 Pages capability → category-only check        | Не блокирует A/B; обязательное owner исправление с failing regression до соответствующих P2 capabilities              |
| AGENTS.md отсутствует в Code Lane protected prefixes | Статический gap; regression и fail-closed policy до P3, development system-write остаётся отдельным scope             |
| Config validate / run events имеют writes            | Учитывать effect class в P0/P1; не публиковать существующий stateful endpoint как read-only                           |
| Runtime CLI status может инициализировать SQLite     | В S3 использовать read-only owner port без initialize; CLI output не доказывает чистое чтение                         |
| Exact runtime mismatch                               | Настроить окружение до реализации; не ослаблять guard                                                                 |
| Git profile отсутствует                              | Для development inspect настроить заранее авторизованный профиль; будущий deterministic server port решается отдельно |
| Monitor/gateway недоступны                           | Не блокирует direct/native/MCP A; managed mode требует своего lifecycle, если будет выбран                            |

Оценка выполнения фиксируется отдельно для A/G/S/B/P/C. Сроки и трудоёмкость не объявляются установленными до M0/M1: Git boundaries, protocol compatibility, управляемая конфигурация, Payload bootstrap, check/worker isolation и recovery требуют инженерного proof. Если готово только чтение без Admin, завершено техническое ядро A, но не первая поставка A+G и не системная интеграция S.

## 16. Этап G — управление MCP-серверами в админке

### G1. Multi-instance contracts и persistence

**Зависимость:** решения M0, общий schema/SDK контракт M1. **Владельцы:** `ai-contracts`, existing integration repository/collections, `src/migrations`.

1. Ввести type descriptor отдельно от instance; hosted/external и management-source unions, стабильные server IDs/keys, transport/host profiles и schema versions. Не создавать secondary server catalog вне existing integration owner.
2. Расширить provider/DTO/parsers/read queries для `mcp:<instance-id>`; bounded list/detail вместо primary-only каталога. Сохранить GitHub/Codex contracts и изолировать instance updates.
3. Определить schema входящих client keys/verifiers/grants и service receipts. Reuse existing vault для outbound credentials; inbound token не хранить как расшифровываемый outbound secret.
4. Зафиксировать transactions/CAS и durable replay namespace с instance и request hash. Расширить current replay helper, audit action enum и service identity contract без фиктивного User.
5. Создать миграции только для фактических schema/constraints изменений; прогнать штатные generators и disposable DB apply/rollback. Plaintext tokens/master key в data fixtures не сохранять.

**Готовность:** G01–G03 на contract/repository уровне; два экземпляра одного типа независимы, collision/retry одного client key не возвращает соседний результат, прежние primary consumers проходят regression.

### G2. Management API, доступ и безопасная проверка

**Владельцы:** existing Payload plugin integration endpoints/services. API располагается под configured plugin prefix и отличается от data-plane `/mcp`.

1. Реализовать list/get/create/update, explicit test/discover, client issue/rotate/revoke, enabled/status и только реально поддержанные apply actions. Input schemas строгие, неизвестные adapter/поле/transport fail-closed.
2. Проверять canManageIntegrations на каждом endpoint, затем instance/operator ceilings. Admin actor не выдаёт себе development grants и не выбирает чужую user identity произвольным полем.
3. Разделить обычные read DTO, write-only outbound credential input и one-time inbound token response. UI auth не использует data-plane bearer. При lost token response replay возвращает receipt без прежнего secret; дальнейшее получение доступа — явная rotation.
4. HTTP destination/DNS/redirect policy и stdio profiles одинаковы для test/discovery и будущих calls. Проверять local endpoints только с конкретного зарегистрированного executor, не адреса браузера/другой машины.
5. Network test вынести из долгой transaction; сохранить результат только при том же config/credential revision. Discovery не включает новые tools и не вызывает их. Save/update/disable/key actions оставляют redacted audit.

**Готовность:** G02/G03/G05/G07; secret/raw document не выдаются, SSRF/redirect/stdio input отрицательные tests проходят; несуществующий MCP/provider не получает fake passed.

### G3. Настоящие Admin list/detail

**Зависимость:** G1/G2 DTO и реальные endpoints. **Владельцы:** предлагаемый `packages/payload-ai-plugin/src/admin/mcp-servers/`, plugin view/navigation и UI kit primitives.

1. Зарегистрировать custom Payload list/detail views и RSC exports; проверить view/route collisions, использовать configured Admin prefix. Не редактировать generated catch-all/import map вручную.
2. Добавить «MCP-серверы» в текущую группу «Настройки». В reference AI → Конфигурация добавить переход на действующий view; не переносить всю админку или shell в рамках MCP.
3. Реализовать каталог нескольких экземпляров, provider-specific формы и области §19.2 спецификации. Status/readiness, enabled и last test отображать отдельно; неподдержанные действия не имитировать.
4. Сохранить dirty form при CAS/сетевой ошибке, одноразовую обработку secret, empty/loading/no-access/unknown-ID states, корректные deep links/back и реальные server validation errors.
5. Проверить оба theme, клавиатуру/focus, узкую ширину и network evidence записи/перезагрузки. При изменении общей навигации проверить integrations/AI settings/runs.

**Готовность:** G01/G08 с реальным сохранением в disposable installation; browser evidence обязателен. Вёрстка без API/пersistence не закрывает G3.

### G4. Managed Realize instance и runtime acknowledgement

**Зависимость:** G2 и действующий M5 listener; G3 для сквозной UI приёмки.

1. Добавить configuration source modes bootstrap/managed и привязку process к immutable server ID. В bootstrap остаётся явный operator-only repository режим без БД; в managed отсутствует fallback к его env grants.
2. Читать server/client permission state до каждого managed dispatch через узкий runtime reader; применять пересечение desired authorization/applied config/host ceiling/current actor ACL. Disable/revoke и сужение действуют сразу, новые grants/клиенты и расширение limits — после нужного acknowledgement. Несогласованные destination/credential/profile versions блокируют вызов. Managed config DB unavailable закрывает calls; standalone не запускает schema push или фоновые product workers.
3. Реализовать authenticated owner projection/apply/status, service receipt и TTL observation. Реально применять supported hot settings, подтверждая revision/config hash. Secret и raw database/config paths не возвращать браузеру.
4. Port/launch profile change сохранять как restart_required. Start/stop/restart публиковать только при настоящем controller lifecycle; при его отсутствии UI передаёт конкретное operator action и не показывает applied. Disable/revoke действует через auth до следующего call независимо от живого listener.
5. Проверить call между save и acknowledgement: revoke, scope expansion, снижение/увеличение limit, смена credentials/destination. Добавить late receipt для прежней revision/process boot, offline, потерю DB, invalid host ceiling, interrupted startup/restart и отсутствие orphan своих процессов. Повтор apply после disconnect не создаёт второй server instance.

**Готовность:** G04/G06, A01–A05/A14 в обоих modes; действующий UI меняет настройки Realize server, real client видит предусмотренный эффект. M7 принимает A+G только после всех G01–G08.

### G5. Последующие adapters и клиенты

Добавлять типы по одному через тот же registry: descriptor/schema, runtime adapter, auth/credential contract, settings renderer, проверенный executor и acceptance. Multiple instances поддерживаются сразу, а не отдельной переделкой после второго типа.

Next.js: связать существующий development adapter с реальным local client/dev instance; client-managed config сначала доступен как metadata/preview, применение в `.codex` проходит developer owner. Payload CMS: проверить официальную версию plugin/endpoint и соответствие Realize ACL/Data Lane до установки; не включать generic CRUD вместо существующих domain services. Ant: уточнить конкретный server/project до runnable descriptor. Generic remote HTTP adapter допустим только с той же destination/auth/discovery policy, а не как обход owner-specific ограничений.

**Готовность каждого adapter:** реальный protocol proof из фактического executor, сохранение/reload/disable двух экземпляров, secrets/permissions isolation и truthful unavailable. Привязка к встроенному административному агенту дополнительно требует P4; сама карточка сервера такую возможность не включает.
