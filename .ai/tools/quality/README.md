# Проверки качества агентского слоя

`npm run ai:quality:structure` проверяет активные инструкции без модели и Git.
Проверка ограничена явными корнями, размером файлов и общим объёмом; symlink,
повреждённый YAML, отсутствующие источники и неполный scan завершаются ошибкой.
Проверяются metadata, уникальные IDs, rule/check/registry связи, локальные
Markdown-ссылки и anchors. История, шаблонные примеры и runtime state не входят
в реестр активных инструкций. Смысл правил требует отдельного review.

Контракт evals и ограничения первого набора:
[стратегия §29.8](../../../documentation/specifications/realize-ai-commerce/v1.0/04-commercial-and-operations/29-testing-strategy.md#298-контракт-первого-baseline-plat-05).

Результат CLI — JSON с полным списком нарушений и hash просмотренных источников.
При превышении бюджета нет частичного `passed`. Инструмент не меняет инструкции.

Общий `readMarkdownLinkSpans` из `readMarkdownLinks.util.ts` возвращает локальные
ссылки с UTF-16 offsets исходного текста. `readMarkdownLinks` и engineering
rewrite используют один extractor; `maskMarkdownCode` исключает frontmatter,
fenced/indented/inline примеры. API не читает файлы и не меняет содержимое.
Смысловая полнота ссылок вне поддержанного Markdown требует отдельной проверки.

## Поведенческий baseline

Trusted owner CLI использует текущую интеграцию платформы и общий ledger:

```bash
npm run ai:eval:run -- --preflight --allow-unknown-subscription-cost --output .ai-workspace/tasks/<task-id>/logs/baseline.json
npm run ai:eval:run -- --allow-unknown-subscription-cost --output .ai-workspace/tasks/<task-id>/logs/baseline.json
npm run ai:eval:gate -- --report .ai-workspace/tasks/<task-id>/logs/baseline.json --review .ai-workspace/tasks/<task-id>/logs/review.json
```

Первый вызов только проверяет подключение, модель и budget policy. Он не создаёт
модельного turn или baseline. Второй ограничен шестью turns/600 секундами;
инфраструктурная ошибка останавливает набор. Новый запуск требует нового имени
отчёта и создаёт новые расходы; автоматического retry нет. Флаг неизвестной
стоимости допустим только для ChatGPT subscription. Для остальных режимов
нужны тариф и hard evaluation budget с резервом в существующем ledger.

Review — отдельный `EvaluationReview` из `@realize/ai-contracts/evaluation`:
`reportHash`, reviewer, время и полезность/честность каждого из шести результатов.
Review нельзя генерировать из флага deterministic passed: необходимо прочитать
ответы и evidence. Его положительный результат не отменяет нарушение scope.

Delivery CI читает `.github/quality-evidence/current.json`, где owner указывает
immutable report/review из той же доверенной ревизии. `ai:eval:gate` проверяет
hash, код, инструкции, окружение, обязательные критерии и review перед сборкой
release/candidate. Эти файлы не являются криптографической аттестацией запуска;
их происхождение подтверждает owner review в доверенном checkout.
Обычный PR CI проверяет структуру и deterministic tests без модельных вызовов.
Evidence для delivery имеет срок свежести 7 суток; будущие Garden/Router также
должны сверять фактическую модель и CLI своей среды перед активацией.

Текущий corpus проверяет продуктовые instruction builders, overlay compiler,
Codex App Server adapter, sandbox и ledger. Worktree delivery/preview, браузер,
полный набор skills и автоматическая IDE-загрузка не покрываются этим corpus.
S1 advisory extractor используется для согласования IDs; строгий YAML/graph
validator не подменяет resolver применимости правил.
