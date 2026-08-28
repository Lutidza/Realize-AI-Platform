# Admin Integrations — implementation report

Дата: 2026-08-27

Статус: реализовано и проверено

## Результат

- В Payload Admin добавлен самостоятельный раздел `/admin/integrations` в
  группе `AI & Delivery`.
- Каталог построен через provider descriptors и отдельные provider forms: новый
  тип интеграции добавляется adapter-ом без выдачи generic CRUD к secret store.
- Реализован первый provider — GitHub: display name, canonical HTTPS repository
  URL, enabled state, write-only personal access token, test status и default
  branch evidence.
- Сохранение, тест и отключение доступны только отдельному
  `canManageIntegrations`; в текущей installation это роль `admin`.
- Browser DTO никогда не содержит token или encrypted envelope. Token шифруется
  AES-256-GCM с provider/connection binding и master key из
  `REALIZE_INTEGRATIONS_ENCRYPTION_KEY`.
- Save, test и disconnect записывают redacted append-only audit events с
  idempotency key. Обновление и удаление атомарно привязаны к ожидаемой
  revision.
- Release worker читает включённый `github:primary` непосредственно перед
  candidate job, расшифровывает token в памяти и передаёт его только дочернему
  orchestrator process. При отсутствии записи сохраняется legacy environment
  bootstrap; disabled или повреждённая запись блокирует job.

Архитектурное решение: [ADR-0012](../architecture/decisions/ADR-0012-admin-integration-registry.md).

## Runtime evidence

- Development runtime: Node.js `24.18.0`, npm `11.15.0`.
- Для локального запуска создан ignored `.env.local` с отдельным случайным
  32-byte vault key; значение не выводилось и не попадает в Git.
- Изолированная PostgreSQL запущена на `127.0.0.1:55434`; все восемь migrations
  имеют статус `Ran: Yes`.
- Приложение запущено на `http://localhost:3000`; `/api/health/ready` вернул
  `database: ok`, `payload: ok`.
- Browser evidence:
  [desktop](evidence/admin-integrations-desktop.png),
  [mobile](evidence/admin-integrations-mobile.png).

## Проверки

| Gate | Результат |
| --- | --- |
| Runtime version gate | PASS |
| Payload migration up/status | PASS |
| Generated Payload types/import map drift | PASS, изменений после повторной генерации нет |
| TypeScript | PASS |
| Prettier | PASS |
| ESLint | PASS, без errors |
| Vitest integration suite | PASS, 23 files / 68 tests |
| Playwright Admin integrations | PASS, 1 end-to-end scenario |
| Next.js production build | PASS |
| Versionable-file secret scan | PASS, 1199 files |

Playwright проверил реальное первичное сохранение, повторное обновление по
revision, ciphertext без plaintext token, отсутствие token в API и DOM,
перезагрузку, desktop/mobile layout и disconnect.

## Ограничения

- Реальный GitHub REST request намеренно не выполнялся без credential владельца.
  После настройки его запускает кнопка `Проверить`.
- Rotation master key и внешний managed vault требуют отдельного adapter-а.
- Новая migration успешно откатывалась в isolated rollback run. Полный rollback
  старых batches затем остановился в существующей migration
  `20260817_124449_realize_ai_readonly` из-за её прежнего порядка удаления FK;
  исходная migration не изменялась в этом scope.
