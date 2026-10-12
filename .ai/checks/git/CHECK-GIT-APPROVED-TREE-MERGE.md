# CHECK-GIT-APPROVED-TREE-MERGE

```yaml
check_id: CHECK-GIT-APPROVED-TREE-MERGE
title: Проверенное дерево и назначение GitHub merge
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/checks/git/
workflow: .ai/workflows/delivery/git/commit-push/WORKFLOW.md
rules:
  - .ai/rules/git/RULE-GIT-DELIVERY.md
```

## Критерии

Применяется внутри обработчика `merge` с единственным mode `approved-tree`.

- Разрешены отдельное действие `merge`, точная целевая ссылка и candidate tree.
  Контекст закрепляет integration key/revision, slug и repository ID, разные
  `refs/heads/*` target/source, их OID и исходный target tree OID. GitHub SHA-1
  задаются 40 hex; модель не выбирает значения.
- `candidateSourceRoot` — канонический каталог внутри
  `<repositoryRoot>/.ai-workspace/tasks/<taskId>/tmp/**`. `candidate.files` ровно
  покрывает approvedChangedPaths: точный path, mode `100644`/`100755` и blobOid;
  удаление задаётся только `mode: null, blobOid: null`. Дополнительные пути,
  каталоги, symlinks, traversal и произвольный источник bytes не разрешаются.
  Удаляемый файл отсутствует в candidate source.
- Подключение получено у общего владельца интеграций как GitHub API credential.
  Ревизия, slug и repository ID совпадают. SSH-профиль не заменяет REST credential;
  секрет и сырые ответы не поступают модели или в журнал.
- Полные recursive manifests исходного и candidate tree прочитаны с проверкой
  ожидаемых SHA. `truncated: true`, неполный ответ или превышение лимита блокируют
  запись. Точный набор изменённых конечных путей равен `approvedChangedPaths`;
  для остальных конечных путей сохранены type, mode и object SHA. Пустой список
  допустим только при одинаковом составе и содержимом дерева.
- До любого POST обработчик безопасно читает только назначенные approved bytes
  из candidateSourceRoot с `O_NOFOLLOW`, проверяет путь, mode, Git blob SHA и
  секреты. Полный target leaf set с разрешёнными overlays должен вычислять
  ровно candidate tree OID. Неизменённые leaf entries сохраняются. Пределы —
  16 MiB на файл и 64 MiB суммарно; остальные snapshot/dependency/cache/env
  файлы не читаются.
- Вызывающая среда проверила содержимое candidate tree и сохранение принятой
  работы. Все обязательные результаты имеют `passed` и fingerprint
  `hashGitMergeCandidate(context)`: SHA-256 канонических refs/tree, источника
  bytes и файловых metadata. Результаты другого дерева, источника bytes или
  исходных refs не подходят. Проверки выполняются отдельно; dependency/build
  cache находится вне approved paths. Обработчик не запускает приложение
  и не передаёт raw blobs модели.
- Immutable blob uploads сверяются по assigned blob OID. Tree создаётся на
  `base_tree: target.treeOid` только из approved entries; ответ должен иметь
  candidate tree OID. Полный manifest результата повторно проверен до commit.
  Ошибка после upload может оставить immutable объекты, но не считается
  подтверждённым обновлением target ref.
- До первого POST общий lock удерживается, а журнал закрепляет binding,
  дерево, два ordered parents `[target.oid, source.oid]`, identity, message и
  единую UTC date автора/коммитера. Ответ создания проверен по этим значениям.
- Перед обновлением target ref обе удалённые refs точно совпадают с назначением.
  Записывается только target ref с `force: false`; затем подтверждается созданный
  commit в этой ссылке. Это fast-forward guard с точными сверками до/после,
  а не unconditional CAS по ожидаемому старому OID.
- Journal stages сохранены до побочных эффектов. Повтор сохраняет requestId,
  контекст и даты, сверяет созданный объект и удалённую ссылку. Неизвестный исход
  или расхождение не разрешают слепую новую запись, смену parents или candidate.
  До каждого object POST сохранён pendingObject. Unknown blob/tree сверяется
  GET: наличие назначенного объекта позволяет продолжить только ещё не начатые
  uploads; отсутствие блокирует запись. Подтверждённый object повторно не создаётся.
- Локальные refs, индекс, рабочие файлы и hooks не меняются этим действием.
  Локальная актуализация требует отдельно разрешённого закреплённого `pull`.

Создание объекта commit и обновление target ref — разные результаты. Только
подтверждённая удалённая ссылка даёт `mergeStatus: succeeded`; unknown не
объявляется успехом. Контракт не предоставляет generic local merge, conflict
resolution, force, PR, deployment или полномочия продуктового SourcePromotion.
