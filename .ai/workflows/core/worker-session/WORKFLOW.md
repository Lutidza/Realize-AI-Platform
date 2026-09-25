# Workflow: worker session (`worker_session_workflow`)

```yaml
artifact_id: worker-session-workflow
artifact_type: ai-workflow
owner_role: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
owner_layer: .ai/workflows/core/worker-session/
related_artifacts:
  - .ai/rules/agent-runtime/RULE-WORKER-SESSION-LIFECYCLE-AND-AUTONOMOUS-MODE.md
  - .ai/rules/worker-runtime/RULE-WORKER-DIALOG-COORDINATION.md
  - .ai/workflows/core/worker-assignment/WORKFLOW.md
  - .ai/checks/worker-runtime/CHECK-WORKER-MONITOR-VISIBILITY.md
  - .ai/checks/worker-runtime/CHECK-CODEX-EXEC-WORKER-RUNTIME-BRIDGE.md
  - .ai/checks/worker-runtime/CHECK-WORKER-HANDOFF-READY.md
  - .ai/checks/self-review/CHECK-WORKER-SESSION-LIFECYCLE-BEFORE-HANDOFF.md
managed_runtime_writer: .ai/tools/agent-runtime/bin/agent-runtime.mjs
```

## Выбор режима

Lifecycle применяется к фактически запущенным worker-ам. Direct work не создаёт
сессий. Для native collaboration используй handles, сообщения и статусы среды;
SQLite, monitor, bootstrap и отдельный coordinator для этого не нужны.
Завершённый native агент может оставаться доступным для follow-up.

Внешний `codex exec` выбирай при необходимости по workflow назначения.
Обычный external режим требует управления настоящим процессом; optional managed
режим дополнительно использует project runtime writer и monitor. Выбор managed
должен быть явным. Полномочия и область задания одинаково ограничены во всех
режимах; дополнительный autonomous grant внутри разрешённой задачи не нужен.

## Общая последовательность

1. Выдай bounded assignment: цель, owner/source, пути, разрешённые действия,
   необходимые checks, результат, адресат и stop condition.
2. Сохрани реальный handle после запуска. Выполняй независимую часть задачи,
   принимай сообщения и разрешай конфликты scope. Поиск можно вести напрямую;
   отдельный search-worker требуется только для полезного разделения работы.
3. Дождись результата или остановки. Для external получи exit status и output;
   при отмене или blocker останови процесс либо передай его явному владельцу
   с причиной и следующим шагом. Запись статуса сама по себе процесс не останавливает.
4. Проверь результат, существенный diff, границы и checks. Прими результат либо
   выдай bounded follow-up. Назначивший агент отвечает за общий итог.
5. Перед handoff выполни lifecycle check только для worker-ов текущей задачи:
   не оставляй бесконтрольно работающих процессов. Сообщи пользователю результат,
   проверки и существенные ограничения.

Для внешнего Codex подключи
`.codex/skills/codex-external-worker-session/SKILL.md`.

## Дополнение для optional managed external runtime

1. Прочитай `.ai/tools/agent-runtime/README.md` и writer/schema выбранного режима.
   Используй существующий runtime только в разрешённом scope. Не создавай
   synthetic records для native handles или чужой работы.
2. Через writer зарегистрируй управляющую `dialog-assistant` session и planned
   external session с assignment и presence до запуска. Для single-worker
   не создавай фиктивную группу.
3. Для настоящей managed группы создай group/member/edge records по writer
   contract. Текущий preflight требует `returns_to_session_id=dialog-assistant`,
   видимого group closer и отдельного coordinator session, отличного от
   `dialog-assistant`. Это ограничение managed group tool, а не всех видов
   делегирования; peers используют разрешённые edges и message/ack contract.
4. Выполни monitor visibility и runtime bridge checks. Команда для single-worker:

   ```bash
   npm --prefix .ai/tools/agent-runtime run runtime -- worker-launch-preflight --session-id=<session-id> --json
   ```

   Только для managed группы добавь `--group-id=<group-id>`. При `pass=false`
   не запускай managed worker; назови blocker. Если managed monitor не был
   условием задания, доступен direct/native режим без synthetic state.
   Launch не стартует сервисы и не меняет порты; lifecycle сервисов принадлежит
   `.ai/workflows/ai-operations/agent-monitor-service-lifecycle/WORKFLOW.md`.
5. После настоящего `codex exec` сохрани process handle и process record,
   затем `running`/`working`. Изменяй lifecycle/presence по фактическому состоянию.
   `process-upsert` и `operator-command-dispatch stop` не являются исполнителем
   запуска или остановки внешнего процесса.
6. Получив результат, зафиксируй `result-ready`/`needs-review`, presence `idle`
   и delivery evidence от настоящего worker-а. Приёмка назначившим агентом
   остаётся отдельным шагом; status не доказывает качество результата.
7. Через writer запиши terminal decision и `closed`/`offline` для завершённых
   сессий. Для незавершённых используй реальные continuation/reassignment/blocker
   contracts по schema, с владельцем и следующим шагом. Разреши blocking
   notifications/messages текущей задачи. Собственную managed coordination
   session завершай до финального ответа после завершения управляемой работы.
8. Не правь SQLite или projections вручную. Экспорт и maintenance запускай
   только при их применимости; завершение обычной задачи не требует housekeeping
   чужих sessions. Runtime records не заменяют ответ пользователю.

В сообщения и artifacts попадают необходимые operational summaries и evidence;
private reasoning, secrets, production dumps и лишние PII исключаются. Эти
инструкции не расширяют security/approval контракты продуктового execution worker.
