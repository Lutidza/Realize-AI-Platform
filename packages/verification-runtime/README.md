# Verification runtime

`@realize/verification-runtime` — общий серверный механизм выполнения проверок
для IDE и platform execution/preview. Архитектурный контракт:
[ADR-0016](../../documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md#выполнение-и-достаточные-проверки).

Пакет владеет валидацией плана, ключом проверки, lifecycle дочернего процесса,
ограничением и очисткой диагностики, receipts и проверкой их актуальности.
Он не выбирает необходимые checks и не выдаёт разрешений на команды или Git.

## Входы и владельцы

Публичный серверный вход — `src/verificationRuntime.server.index.ts`.
`runVerification(plan, options)` выполняет выбранные missing/failed/stale checks
и проверки `reuse: "never"`. `verifyVerification(plan, options)` читает состояние
без выполнения. `validateVerificationPlan` проверяет versioned JSON-план;
`enumerateVerificationInputs` и `hashVerificationRecipe` нужны evidence adapters.

План содержит `version`, `projectId`, `taskId`, `repositoryRoot` и `checks`.
Check задаёт команду `node`/`npm`, inputs, точные `excludeInputs`, окружение,
timeout, `reuse: local|never`, `extent: targeted|full` и причину широкого запуска.
Inputs `.` учитывают новые source-файлы верхнего уровня; служебные `.git`,
`node_modules`, `.ai-workspace` пропускаются при обходе дерева.
Исключения check не отменяют обязательные и дополнительные inputs.

Доверенный вызывающий adapter отдельно передаёт `options.storage` — существующий
канонический корень и безопасный относительный каталог, `additionalInputs`,
необязательный AbortSignal и политику переносимости. Значения storage из плана
не принимаются. `PrivateJsonRepository` обеспечивает bounded JSON, descriptor IO,
запрет symlinks, atomic write, `fsync` и отдельную блокировку.

| Adapter                                 | Дополнительная ответственность                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| IDE `.ai/tools/git-delivery`            | CLI, scope/authorization, inputs самого Git-инструмента, fingerprint и proofs точных OID                                   |
| Platform `services/ai-execution-worker` | Approved checks, environment allowlist, storage вне worktree, mapping в `WorkerCheckResult`, usage и сохранение результата |

IDE receipts хранятся в `.ai-workspace/tasks/<taskId>/logs/git-verification`;
platform receipts — в `.ai-workspace/runtime/verification` исходного repository.
Project/task namespace не переносит разрешения между входами. Проверка receipt
не запускает модель, не создаёт задачу и не активирует установленный runtime.

## Повторное использование

Ключ связывает source bytes, состав каталогов, recipe, конфигурацию, manifests,
lockfiles, dependency inventory, runtime/platform и hash эффективного environment.
Исходники общего runner также входят в ключ. Значения секретов не сохраняются.
Исполняемый owner должен находиться в серверной раскладке `packages/**`;
встроенный npm — в `node_modules/npm/bin/npm-cli.js`. Неподдерживаемый layout
отклоняется до выполнения проверки, чтобы отсутствующие файлы не образовали
ложное доказательство неизменности runtime.
Входы проверяются до/после команды и перед выдачей итогового результата.
Неизвестное или изменённое состояние не даёт успешного reuse.

По умолчанию `portability: "workspace"` связывает результат с рабочим корнем.
`portability: "content"` требует opaque lease от
`materializeVerificationDependencies(hostRoot, workspace)`. Materializer сам
копирует dependencies, сверяет host inventory до/после и фиксирует inventory
копии. При каждом checkpoint проверяет копию снова. Произвольный объект с
digest не заменяет lease. Очисткой workspace/dependencies владеет платформа.

Platform policy допускает reuse для `lint`, `format:check`, `typecheck`.
Последний дополнительно связывает `.next/types` и `.next/dev/types`. Сборка
всегда выполняется для создания артефактов; integration tests, БД, browser и
secrets check также требуют нового запуска. Внешнее состояние и Git membership
не доказываются одним source key.

Это локальное cooperative filesystem evidence, а не атомарный snapshot или
изолирующая граница против произвольного параллельного процесса. При timeout
или отмене runner завершает группу процессов, затем применяет SIGKILL после
grace period и ждёт закрытия потоков. Вывод ограничен и очищен; результат
различает `executed` и `reused`.

Пакет зависит от `@realize/git-runtime` только для общей блокировки и PolicyError;
Git-команды в нём не выполняются. Platform manifest включает пакет, System AI
publisher связывает production sources; Docker переносит `packages/**` целиком.
Публикация source artifact не заменяет установку и отдельную runtime-проверку.
