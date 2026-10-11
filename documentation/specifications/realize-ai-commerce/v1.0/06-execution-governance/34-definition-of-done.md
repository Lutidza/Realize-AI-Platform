# 34. Definition of Done

- **Статус:** target acceptance contract

Capability считается готовой только при выполнении применимых пунктов.

## Contract

- versioned DTO/schema/capability и владелец определены;
- manifest связывает применимые версии ядра, профиля, схемы, AI-слоёв,
  API/adapter и результаты проверки совместимости;
- Git-назначения платформы и клиента имеют отдельные identity/permissions;
  core release, project commit и версии CI/check pack различимы в evidence;
- target/current distinction отражена в docs;
- access, protected scopes, risk, limits и approvals покрыты;
- idempotency, conflicts, retry и cancellation определены.

## Execution

- реальный side effect проходит только server executor;
- exact plan/config/input hashes проверяются до mutation;
- audit/events/usage сохраняются;
- model/router decision и все provider attempts имеют происхождение;
- реальные расходы, оценки и неизвестные суммы различены; duplicate events
  не удваивают учёт, реальные retries не теряются;
- failure не маскируется как success;
- rollback или explicit manual recovery проверены.

## Evidence

- data capability протестирована с реальной PostgreSQL;
- schema change — empty/upgrade/restore proof;
- code capability — clean worktree, diff gates и checks;
- UI — browser evidence;
- release — immutable signed digest и health;
- production — approval-bound rollout и rollback drill;
- Git/CI — реальная scoped операция, проверенные repository/environment
  protections и доверенное происхождение checks/artifacts для exact commit;
- обновление клиента — проверенный переход между двумя выпусками с локальными
  доработками, конфликтом, миграцией и восстановлением;
- инструкции/model/router — структурные проверки и применимые сценарные evals
  с baseline качества, задержки и стоимости на зафиксированных входах.

## Security

- injection/escalation/hidden-data/cross-installation tests пройдены;
- secrets не появились в prompt, DTO, logs, diff или artifacts;
- локальный AI-layer не расширяет system policy;
- license не выдаёт security authority;
- клиентские Git/CI credentials не дают системных полномочий; поддельный CI
  status и изменённый workflow не обходят обязательные проверки платформы;
- production system AI исполняется в доверенном сервисе владельца; изменение
  кода клиентской установки не меняет его policy;
- этот рубеж проверен до первого внешнего клиентского подключения.

## Product completion

Функция доступна из согласованного интерфейса, объясняет blocked state и
работает end-to-end. Текстовый mock, disabled button, dry-run-only или
неприменяемое предложение не соответствуют DoD.

Чекпойнт исходников или внесение задачи в roadmap не являются приёмкой функции.
Статус `completed` сопровождается evidence для точных версий и явным перечнем
ограничений. Область проверок выбирается по изменению; неприменимые пункты
не требуют полного прогона всех контуров платформы.
