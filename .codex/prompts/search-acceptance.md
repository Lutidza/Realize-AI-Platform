# Приёмка поиска

Исполняемый адаптер для
[правила поиска](../../.ai/rules/development/RULE-SEARCH-SCOPE-DISCIPLINE.md)
и [проверки](../../.ai/checks/pre-implementation/CHECK-SEARCH-SCOPE-DISCIPLINE.md).
Архитектура и критерии принадлежат
[repository-search](../../documentation/architecture/repository-search.md#полная-приёмка).

1. Проверь prerequisites в [README инструмента](../../.ai/tools/agent-search/README.md#проверки):
   проектные Node/npm, установленные зависимости и `rg`, PostgreSQL binaries,
   Chromium. Не устанавливай/обновляй пакеты неявно; рабочая БД разрешена только
   для read-only full preflight, не для fixtures. Подготовь operator evidence
   реальных consumers по canonical architecture, включая внешний ChatGPT.
2. Из корня проекта запусти `npm run check:search`. Не запускай параллельно
   тяжёлую сборку или benchmark. Следи за фактическим process handle до завершения;
   SIGINT/SIGTERM передают остановку runner-у, который закрывает свои процессы.
3. Открой напечатанный `reports/acceptance.json`: требуются `outcome=passed`,
   `cleanup=true`, installed и все fixture фазы. Итог incomplete не принимай
   как success. Явный check:search:isolated используется в CI и для fixtures;
   isolated_passed не подтверждает установленную систему/ChatGPT. Для причины ошибки читай только адресный
   журнал/отчёт; не загружай целиком все артефакты в контекст.
   Сравнивай `initial/repeat` корпусов отдельно от `phases.browser.cliProcess`:
   последний содержит первый и повторный запуск настоящего CLI процесса.
   Кеш ОС не очищается; эти значения не доказывают холодное чтение с диска.
4. При ошибке исправь причину в её владельце и повтори затронутую проверку,
   затем полную приёмку. Не превращай skip в успех, не отключай guards.
   При недоступном prerequisite сообщи конкретный непроверенный контур.
5. Сообщи итог, фактическое покрытие и путь evidence. CI использует явно isolated command;
   локальный успех не означает, что GitHub workflow уже был выполнен.

Вызовы модели, публикация, commit и push в эту процедуру не входят.
