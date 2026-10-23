# ADR-0017: Внутренний MCP и управление экземплярами серверов

## Статус

accepted-as-target, 2026-09-20. Начало реализации разрешено пользователем.
Фактическая готовность определяется проверками A+G, а не статусом ADR.

2026-09-23: A+G реализованы; фактические проверки и ограничения отражены в плане.
2026-09-24: S1 реализован; локальный developer Codex подключён отдельно от
managed Admin instances. S2–S5/B/P/C остаются целевыми этапами.
S/B/P/C и внешние executors остаются целевым продолжением.

Уточняет ADR-0007, ADR-0012, ADR-0015 и ADR-0016 в описанных ниже границах.
Исторические решения о product Code/Data Lane и Git delivery сохраняются.

## Контекст

Проекту нужен MCP как вход в системный рабочий слой и административные
возможности. Чтение репозитория и Pages составляет первую основу A.
Эксплуатационные настройки нескольких серверов должны управляться из Admin
у существующего владельца интеграций. Полный контракт и этапы —
[спецификация](../../specifications/internal-mcp.md) и
[план](../../specifications/internal-mcp-implementation-plan.md).

## Решение

1. `services/internal-mcp` — отдельный loopback HTTP composition root,
   официальный MCP SDK владеет протоколом. Бизнес-операции остаются у
   существующих владельцев. Первая поставка — A+G; системный цикл S,
   административные B/P и клиент C внедряются отдельными проверяемыми этапами.
2. Общая политика чтения репозитория принадлежит каталогу контекста
   `services/ai-control-plane/src`, без импорта entrypoint CP. MCP и Context
   Pack используют один owner. Статические `AGENTS.md`, `.ai` и `.codex`
   доступны только server-authorized developer principal; секреты, private
   runtime и task state исключены. Installation Admin не расширяет этот grant.
3. `.ai/tools/git-delivery/src/read` предоставляет deterministic machine read
   ports для HEAD/status/diff через общий `@realize/git-runtime` по ADR-0016.
   Доверенная composition задаёт root, разрешённые пути,
   principal, deadline и limits. Политика применяется до чтения содержимого.
   Порт не запускает LLM, не меняет индекс, не использует сеть и не принимает
   произвольные команды. Development Git агента использует программный `inspect`
   и отдельного модельного Git-воркера остальных действий по ADR-0016;
   MCP read port не заменяет эти адаптеры.
   Подключение GPT использует те же grants и tools; общий engine не добавляет
   write permissions или публичный произвольный Git API.
4. Pages server facade находится в Payload plugin и использует реальные
   actor ACL и существующие DTO. AIRun не фабрикуется ради чтения. Payload
   запускается лениво без schema push, seed, cron или product worker.
5. Multi-instance manager расширяет integration registry: provider `mcp`,
   immutable `connectionKey=mcp:<server-generated-id>`. Тип сервера отделён
   от экземпляра, направления `hosted_endpoint|external_connection` и
   источника управления `admin_managed|operator_managed|client_managed`.
   Новый каталог интеграций не создаётся. Outbound credentials остаются в
   существующем vault; inbound keys имеют отдельные необратимые verifiers.
6. Payload custom views «Настройки → MCP-серверы» и management API используют
   текущую сессию, `canManageIntegrations`, operator ceilings, CAS и durable
   replay. Все replay bindings включают connectionKey и canonical request
   hash. Создание даёт отключённый экземпляр. Admin API не использует MCP
   bearer и не выдаёт самому себе системные права.
7. Bootstrap допускает только repository read по явному env grant. Managed
   mode читает текущую конфигурацию и grants из БД перед dispatch; при сбое БД
   закрывает доступ, без fallback на bootstrap. Host trust anchors, profiles
   и ceilings задаёт оператор. Поддержанные эксплуатационные настройки и
   clients находятся в Admin.
8. Изменение runtime projection атомарно повышает desiredRevision. Dispatch
   пересекает свежие desired permissions, verified applied configuration,
   host ceilings и свежие actor ACL. Ограничения действуют сразу, расширения
   ждут применения. Credentials/destination/profile привязаны одной версией;
   несовместимая pending-конфигурация блокирует вызов. Service acknowledgement
   связан с instance, host, boot ID, hash и revision; устаревшее подтверждение
   не восстанавливает права. Health/test/heartbeat не изменяют desiredRevision.
9. Service receipts имеют собственную типизированную identity, без фиктивного
   User. Изменения администратора сохраняют настоящего actor. Одноразовый
   client token не восстанавливается из журнала replay. Неподдержанные
   start/stop/restart не изображаются работающими кнопками.
10. External HTTP/stdio adapters используют проверенные destinations и
    registered launcher profiles; произвольные shell/env запрещены. Discovery
    не разрешает исполнение tools. Встроенный Codex сохраняет действующий
    запрет outbound MCP до отдельной реализации consumer bridge P4.

## Последующие системные этапы

S1 расширяет существующий repository/context owner в
`services/ai-control-plane/src` bounded resolver-ом статических инструкций.
DTO принадлежат `packages/ai-contracts/src`; регистрации и capability discovery
используют общий каталог `services/internal-mcp/src`. Операторский developer
grant и явный allowlist tool сохраняются; S1 не выдаёт write permissions.
Конкретный read contract и ограничения prose review — §16.2 спецификации.

Для S источники инструкций остаются `.ai`, task artifacts — `.ai-workspace`,
managed runtime — `.ai/tools/agent-runtime`. Facades расширяют этих владельцев,
а ограниченный check/patch executor размещается у существующего tooling owner
после scoped reuse scan. Все операции связывает server-owned workspaceBindingID.
Без реального native host API выбирается внешний ограниченный executor;
запись request в runtime store не считается запуском процесса. Monitor не
обязателен для обычной native collaboration. Конкретные исполняемые S-контракты
фиксируются до соответствующего кода и не объявляются реализованными в A+G.

## Последствия и проверка

Потребуются строгие DTO, изменения схемы и миграции Payload, реальное применение
настроек и Admin UI. Проверки включают SDK обеих protocol eras, безопасное FS/Git
чтение, Pages ACL, CAS/replay/revocation, поздние acknowledgements и браузер.
Env-only endpoint не закрывает A+G. Техническая приёмка и оставшиеся ограничения
фиксируются в плане; commit, push и deploy требуют отдельного разрешённого действия.
