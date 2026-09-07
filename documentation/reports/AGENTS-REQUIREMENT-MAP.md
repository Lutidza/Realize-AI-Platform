# Проверка сохранности требований AGENTS.md

Исходник для сравнения — `AGENTS.md` из коммита `484cf7d`.
Проверено содержание правил и проверок, а не только наличие файлов или
совпадение слов. Таблица описывает выполненный перенос и не вводит новые
инструкции для агента.

## Карта требований

| Требование исходного файла | Где сохранено | Результат |
| --- | --- | --- |
| Обязательный вход в проектные инструкции | [AGENTS.md](../../AGENTS.md), [вход .ai](../../.ai/README.md) | Сохранён протокол; второй обязательный порядок входа убран |
| `.ai` владеет правилами, `.codex` — адаптерами | [Вход .ai](../../.ai/README.md), [адаптер Codex](../../.codex/README.md) | Смысл сохранён, приоритет указаний среды и пользователя обозначен |
| Назначение каталогов, ролей, процессов, шаблонов и инструментов | [Карта .ai](../../.ai/STRUCTURE.md), [карта .codex](../../.codex/STRUCTURE.md) | Подробная карта уже есть; из AGENTS доступна по ссылке |
| Анализ текущей реализации и похожих решений до правки | [Глобальное правило](../../.ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md), раздел 1 | Уже есть; краткий порядок сохранён в AGENTS |
| Исправление причины в ответственном слое | [Общее правило разработки](../../.ai/rules/development/RULE-DEVELOPMENT-STRICT-PRINCIPLES.md), раздел 9 | Уже есть |
| Сохранение архитектуры и запрет несогласованной замены стека | [Глобальное правило](../../.ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md), раздел сохранения проекта | Добавлена явная общая норма |
| Запрет имитации выполнения команд, проверок и работы другого агента | [Общее правило разработки](../../.ai/rules/development/RULE-DEVELOPMENT-STRICT-PRINCIPLES.md), раздел 5 | Уже есть; краткое ограничение оставлено в AGENTS |
| Русский язык и точные технические названия | [Правило языка](../../.ai/rules/global/RULE-WORKING-ARTIFACT-LANGUAGE.md), AGENTS | Сохранены; текст нового протокола русский |
| Выбор правил и проверок до реализации | [Реестр](../../.ai/registry/rules/INDEX.md), [глобальный раздел](../../.ai/registry/rules/global/INDEX.md) | Сохранён; глобальное правило не теряется при выборочном чтении |
| Источник истины, ответственный слой, пути создания/изменения/удаления, проверки и полномочия | [Глобальное правило](../../.ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md), разделы подготовки и обязательного вывода | Полный состав уже есть; повтор формы в AGENTS удалён |
| Границы задачи и необходимость отдельного разрешения на её расширение | [Роль владельца границ](../../.ai/roles/process-tools-operations/scope-contour-owner/INDEX.md), AGENTS | Сохранены пользовательские ограничения и запрет попутного рефакторинга; детали повторных согласований остаются в AI-02 |
| Контекст и карта проекта принадлежат документации | [Контекст](../project-context.md), [структура](../architecture/project-structure.md), [системный вход](../../.ai/system/INDEX.md) | Уже есть; AGENTS направляет к этим источникам |
| Синхронизация затронутых правил, проверок, реестра, ролей, процессов и адаптеров | [Навык синхронизации](../../.codex/skills/skill-documentation-sync/SKILL.md), [.ai/README](../../.ai/README.md) | Сохранена для затронутого изменения |
| Отсутствие чужих инструкций, заглушек и устаревших связей | [Правило очистки](../../.ai/rules/scope-control/RULE-STALE-ARTIFACT-CLEANUP-AFTER-REFACTOR.md), [.ai/README](../../.ai/README.md) | Сохранено; готовность одной задачи не требует устранить весь существующий долг |
| Payload CMS 3 и Next.js App Router | [Серверные границы](../../.ai/rules/development/backend/RULE-PAYLOAD-NEXT-BACKEND-BOUNDARIES.md) | Уже есть |
| Переиспользование полей, hooks, access и компонентов Payload Admin | [Правило переиспользования](../../.ai/rules/development/backend/RULE-BACKEND-REUSE-BEFORE-LOCAL-IMPLEMENTATION.md), [проверка](../../.ai/checks/development/backend/CHECK-BACKEND-REUSE-BEFORE-LOCAL-IMPLEMENTATION.md) | Дополнено компонентами Payload Admin |
| Изменение БД через миграции или согласованный способ обновления схемы | [Правило данных](../../.ai/rules/development/backend/RULE-PAYLOAD-DATA-CONTRACT-FIRST.md), [проверка](../../.ai/checks/development/backend/CHECK-PAYLOAD-DATA-CONTRACT-FIRST.md), [навык](../../.codex/skills/payload-next-contracts-first/SKILL.md) | Уточнено: schema push только для явно согласованной одноразовой локальной БД |
| Геоконтракты и PostGIS | [Правило данных](../../.ai/rules/development/backend/RULE-PAYLOAD-DATA-CONTRACT-FIRST.md), его проверка | Сохранена проверка существующего механизма; PostGIS не объявлен обязательной установленной технологией |
| Payload — источник данных, поисковый индекс и кэш производны | [Правило поиска](../../.ai/rules/development/backend/RULE-SEARCH-INDEXING-CACHE-BOUNDARIES.md), [проверка](../../.ai/checks/development/backend/CHECK-SEARCH-INDEXING-CACHE-BOUNDARIES.md), серверный навык | Сохранено; Elasticsearch и Search Profile проверяются при фактическом наличии |
| Запрет ручного изменения типов, карты импортов и результатов сборки | [Глобальное правило](../../.ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md), [общая проверка](../../.ai/checks/development/CHECK-DEVELOPMENT-STRICT-PRINCIPLES.md) | Добавлен полный общий запрет; команды генерации исправлены в серверном и DTO навыках |
| Запрет записи секретов в код, инструкции, документацию и Git | [Глобальное правило](../../.ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md), его общая проверка | Добавлена общая норма, включая диагностику; предусмотренное защищённое хранение сохранено |
| Проверка версий и совместимости зависимостей | [Правило зависимостей](../../.ai/rules/development/RULE-DEPENDENCY-VERSION-EVIDENCE-BEFORE-INSTALL.md), [проверка](../../.ai/checks/development/CHECK-DEPENDENCY-VERSION-EVIDENCE-BEFORE-INSTALL.md) | Уже есть; доступно из общего раздела разработки |
| Поиск существующего интерфейса и владельца маршрутов | [Правило интерфейса](../../.ai/rules/development/frontend/RULE-NEXT-REACT-FRONTEND-BOUNDARIES.md), [роль](../../.ai/roles/developer/frontend/INDEX.md) | Неверные пути заменены маршрутами к реальным владельцам; исправлены связанные маппер, проверка и навык работы с образцом |
| Переиспользование shadcn, Radix и lucide | [Правило переиспользования интерфейса](../../.ai/rules/development/frontend/RULE-REUSE-BEFORE-LOCAL-IMPLEMENTATION.md) | Уже есть |
| Разделение Server Components и Client Components | [Правило интерфейса](../../.ai/rules/development/frontend/RULE-NEXT-REACT-FRONTEND-BOUNDARIES.md), [проверка](../../.ai/checks/development/frontend/CHECK-NEXT-REACT-FRONTEND-BOUNDARIES.md) | Уже есть |
| Браузер для DOM, CSS, адаптивности, форм, фокуса и взаимодействия; снимки для сравнения | [Самопроверка интерфейса](../../.ai/checks/development/frontend/self-review/CHECK-FRONTEND-GUARDRAIL-SELF-REVIEW.md), [навык проверки](../../.codex/skills/frontend-runtime-evidence/SKILL.md) | Уже есть более точные условия применения |
| Процедуры commit/push и исключение секретов, зависимостей, дампов, результатов сборки и журналов из Git | [Порядок Git](../../.ai/workflows/delivery/git/commit-push/WORKFLOW.md), [проверка состава коммита](../../.ai/checks/pre-commit/CHECK-DELIVERY-COMMIT-SCOPE.md) | Уже есть; перечень исключений уточнён |
| Готовность: правильный слой, достаточные проверки, синхронизация, честный результат | [Основной процесс](../../.ai/workflows/core/main-delivery/WORKFLOW.md), [общая проверка](../../.ai/checks/development/CHECK-DEVELOPMENT-STRICT-PRINCIPLES.md) | Смысл сохранён; повторяющийся перечень из AGENTS удалён |
| Документация установленного Next.js и предупреждения об устаревании | [Общее правило разработки](../../.ai/rules/development/RULE-DEVELOPMENT-STRICT-PRINCIPLES.md), раздел 6 | Добавлено; ссылки включены в клиентское и серверное правила, критерии — в их проверки |

## Управление блоком Next.js

В [next.config.ts](../../next.config.ts) задано `agentRules: false`, чтобы
Next.js не восстанавливал английский блок в русском протоколе. Параметр
подтверждён документацией установленной версии
`node_modules/next/dist/docs/01-app/02-guides/ai-agents.md` и условием в
`node_modules/next/dist/server/lib/start-server.js`.
Полезное требование работы с документацией сохранено отдельно в правилах.

## Границы результата

Этот шаг сохраняет смысл требований корневого файла и исправляет связанные
пробелы. Он не завершает весь [чеклист оптимизации](AI-LAYER-IMPROVEMENT-CHECKLIST.md).
Отдельно остаются противоречия общей машины состояний, повторных согласований,
форм отчётности, комментариев, отсутствующей матрицы проверок и старых путей
в полном DTO-навыке. Эти известные проблемы не являются результатом переноса.

## Проверка

- Локальные ссылки, YAML изменённых документов и метаданные трёх затронутых
  навыков проверены; отсутствующих ссылок в проверенной выборке нет.
- Независимая сверка старого и нового AGENTS с таблицей и связанными изменениями
  не обнаружила потерянных важных требований или новых ошибок маршрутизации.
- `npm run typecheck -- --incremental false` — успешно.
- ESLint и Prettier для `next.config.ts`, `git diff --check` — успешно.
- Конфигурация импортирована через `withPayload`: `agentRules` остаётся `false`,
  `standalone` и список компилируемых пакетов сохранены.
- Сервер разработки, сборка приложения, браузер и миграции не запускались:
  поведение приложения не менялось, конфигурация проверена непосредственно.

`AGENTS.md`: 170 → 74 строки, 10 512 → 7 441 байт UTF-8. Это размер документа,
а не измеренная экономия токенов или времени работы агента.
