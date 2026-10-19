---
name: git-commit-push
description: >-
  Передаёт Git-операции отдельному воркеру: чтение, управление remote/worktrees/ветками,
  разрешённые commit, fetch, pull, push через HTTPS/SSH и GitHub merge проверенного дерева.
  Используй для Git рабочего слоя.
---

# Git через воркера

Открой [порядок Git-операций](../../../.ai/workflows/delivery/git/commit-push/WORKFLOW.md)
и указанные в нём инструкции только для выбранного действия.

## Передача задания

- Выбери [рабочий контекст](../../../.ai/rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md#выбор-рабочего-контекста):
  короткая операция не создаёт TASK и не запускает task-workspace; продолжение
  использует существующую серверную задачу либо локальный резерв.
  Необходимые файлы и журнал сохраняй по
  [README обработчика](../../../.ai/tools/git-delivery/README.md#короткая-операция-и-рабочий-контекст).
  Завершённое досье не переоткрывай молча ради доставки.

- Для любого действия явно назначь в окружении запуска
  `REALIZE_GIT_CODEX_HOME`: непустой абсолютный путь без NUL. Каталог должен
  существовать и быть заранее авторизован оператором для Codex CLI. Например,
  из корня проекта, заменив placeholder на подготовленный путь:

  ```sh
  export REALIZE_GIT_CODEX_HOME=/absolute/authorized-codex-profile
  ```

  Adapter проверяет строку пути, но не существование каталога и не содержимое
  credentials. Некорректное значение блокирует запуск с `worker_profile_invalid`.
  Унаследованные `HOME`, `CODEX_HOME` и API keys не заменяют явный выбор.
  Это профиль development Git worker; контракт окружения и границы продуктовой
  авторизации описаны в [README обработчика](../../../.ai/tools/git-delivery/README.md#git-воркер).

- Для обычного `inspect` выполни из корня проекта `npm run --silent git:worker -- inspect`.
  Этот вход запускает отдельного воркера через Codex App Server; сам вызов
  основным агентом является передачей задания, Git выполняет обработчик по
  запросу воркера. Составление контекста и прямой вызов Git CLI не нужны.
- Для разрешённого локального `commit` вызывающая среда назначает
  `REALIZE_GIT_CONTEXT_FILE` и выполняет `npm run --silent git:worker -- commit`
  с необязательным сообщением одним следующим аргументом. Подготовка контекста и
  привязка проверок описаны в [README обработчика](../../../.ai/tools/git-delivery/README.md#контекст-локального-commit).
  Файл не заменяет пользовательское разрешение. Автор берётся из полей формы
  интеграции, если `identity` не передана явно. Без разрешения, проверок или
  настроенного автора вход блокируется.
- Если пользователь явно запросил полный add/commit текущего состава,
  вызывающая среда может передать `scope: { mode: "all", includePartialIndex: true }`
  по [контракту commit](../../../.ai/tools/git-delivery/README.md#контекст-локального-commit).
  Флаг разрешает включить полные рабочие версии частично подготовленных файлов;
  без него прежний запрет сохраняется. Его не назначает Git-модель.
- Для разрешённого `push` назначь `REALIZE_GIT_CONTEXT_FILE` и выполни
  `npm run --silent git:worker -- push`. Состав контекста и настройки
  подключения — в [README обработчика](../../../.ai/tools/git-delivery/README.md#контекст-push).
  Подключение получает обработчик из БД; модель вызывает `git_push` без аргументов.
- Для `manage` назначь `REALIZE_GIT_CONTEXT_FILE` с одной разрешённой операцией и
  выполни `npm run --silent git:worker -- manage`. Контекст и лимиты описаны в
  [README обработчика](../../../.ai/tools/git-delivery/README.md#контекст-manage).
  Читающие операции требуют разрешённого анализа; запись — разрешённого изменения.
  Модель вызывает только `git_manage({})`, параметры назначает вызывающая среда.
- Для разрешённого `fetch` или `pull` назначь `REALIZE_GIT_CONTEXT_FILE` по
  [sync-контракту](../../../.ai/tools/git-delivery/README.md#контекст-fetch-и-pull)
  и выполни `npm run --silent git:worker -- fetch` либо `npm run --silent git:worker -- pull`.
  Назначение закрепляется ожидаемыми хешами и ревизией подключения. Pull требует
  чистой рабочей копии и допускает только fast-forward; отказ не разрешает stash/rebase.
- Для разрешённого GitHub `merge` назначь `REALIZE_GIT_CONTEXT_FILE` по
  [контракту approved-tree](../../../.ai/tools/git-delivery/README.md#контекст-merge)
  и выполни `npm run --silent git:worker -- merge`. Вызывающая среда задаёт
  закреплённые target/source refs, candidate tree, точный approvedChangedPaths,
  bounded candidateSourceRoot и file/blob descriptors,
  identity, message и привязанные к candidate результаты проверок.
  Модель вызывает только `git_merge({})`. До upload обработчик проверяет
  approved bytes, mode, blob/tree SHA и секреты; создаёт только assigned
  immutable blobs/tree и проверяет manifest. Dependency/build cache для
  проверок находится вне approved paths. Обработчик создаёт commit с двумя
  ordered parents и обновляет target ref с `force: false`; локальная актуализация
  выполняется отдельно разрешённым `pull`.
- Передай `action` (`inspect`, `commit`, `push`, `manage`, `fetch`, `pull`, `merge`) и необязательный
  `message` только для локального commit. Заданный текст сохраняй; при его отсутствии
  воркер составляет краткое сообщение Conventional Commits по изменениям.
- Доверенный контекст передаётся механизмом запуска, отдельно от текста задания:
  рабочая копия, разрешённая область и действия, сведения о проверках. Не включай
  историю диалога, пересказ каждого файла, комментарии с историей или секреты.
- При native-запуске используй `fork_turns="none"` и фактически доступную
  выбранную модель. Для внешнего `codex exec` применяй профильный навык только
  если этот способ запуска действительно настроен и нужен.
- Получи отчёт воркера и передай существенный результат пользователю.
  Порядок Git-команд принадлежит обработчику, ограничения — связанному правилу.

## Доступность

`inspect`, локальный `commit`, отдельный `push`, `manage`, `fetch`, `pull` и `merge` используют
отдельные профили. Профили
[чтения](../../agents/delivery/git/inspect.json),
[коммита](../../agents/delivery/git/commit.json) и
[отправки](../../agents/delivery/git/push.json),
[управления](../../agents/delivery/git/manage.json),
[fetch](../../agents/delivery/git/fetch.json),
[pull](../../agents/delivery/git/pull.json) и
[merge](../../agents/delivery/git/merge.json) задают модель и предел времени;
инструкции — [inspect](../../prompts/workflows/delivery/git/inspect.md),
[commit](../../prompts/workflows/delivery/git/commit.md) и
[push](../../prompts/workflows/delivery/git/push.md),
[manage](../../prompts/workflows/delivery/git/manage.md),
[fetch](../../prompts/workflows/delivery/git/fetch.md),
[pull](../../prompts/workflows/delivery/git/pull.md) и
[merge](../../prompts/workflows/delivery/git/merge.md).
Запуск возвращает фактический `result`, эффективную `command` и сведения о воркере.
Успех требует `status: succeeded`; наличие текста модели его не доказывает.
Для повтора commit сохраняй исходный контекст, requestId и сообщение из `command`.

Для повтора `manage`, `fetch`, `pull` или `merge` сохраняй requestId и точный контекст.
Обработчик сверяет журнал и состояние; неизвестный исход или расхождение
не разрешают другую запись. Успешный повтор может вернуть `result.status: noop`.

Для merge журнал сохраняет tree, два ordered parents, identity, message и UTC
date до любого POST, pending object — до его upload. Unknown object сначала
сверяется GET: найденный позволяет продолжить ещё не начатые uploads без
дублирования, отсутствие блокирует запись. Создание commit не доказывает обновление target ref. GitHub
`force: false` обеспечивает fast-forward guard со сверками refs до/после,
но не unconditional CAS по expected old OID. Не выбирай новую дату, дерево или
requestId для обхода unknown; локальные Git merge и conflict resolution в эту
action не входят. Статус изолированной приёмки расширения указан в ADR-0016.

Для разрешённого исправления прерванного commit используй
[восстановление локального commit](../../../.ai/tools/git-delivery/README.md#восстановление-локального-commit):
прежний requestId и команда, актуальные результаты проверок, следующий номер
и отпечаток принятого снимка в recovery. Его назначает вызывающая среда;
воркер по-прежнему получает только commit и сообщение.

Для повтора push сохраняй исходный контекст и requestId. `pushStatus: unknown`
требует сверки назначения; новый идентификатор не разрешает повторную отправку.
После разбора и разрешения на восстановление добавь в исходный контекст
`recovery: { "attempt": N }` по README обработчика. Следующий номер назначает
вызывающая среда, не модель; использованный номер не повторяет сетевую запись.
При отказе передавай `diagnostic.stage`, `category` и `exitCode`, если они есть;
не выдавай `unknown` за установленную причину.

Объединённый `commit_push` ещё недоступен. Сообщи блокер; не заменяй маршрут прямой CLI или ручными Git-командами.
Разрешение на `inspect` не разрешает последующую запись.

При реализации используй [ADR-0016](../../../documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md).
Эта спецификация не загружается для каждой обычной операции.
