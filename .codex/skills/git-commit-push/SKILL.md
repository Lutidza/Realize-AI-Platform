---
name: git-commit-push
description: >-
  Используй для авторизованного пользователем commit или commit/push текущего
  репозитория: scoped staging, достаточные проверки, GitHub SSH delivery.
---

# Commit и push

Прочитай `.ai/workflows/delivery/git/commit-push/WORKFLOW.md` и связанные checks,
если ещё не загружены. Обычная delivery не требует отдельного worker/runtime.

1. Проверь `git status --short`, ветку и diff; отдели scope задачи от чужих
   изменений. Перед выводом remote убедись, что URL не содержит credentials.
2. Используй результаты проверок текущего diff. Недостающие проверки выбирай
   по риску из `.ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md`:
   AI/docs — syntax/links/diff; код — релевантные lint/typecheck/tests;
   schema — migration checks. Full build/test и DB status не нужны для каждого
   commit. Команды бери из актуального `package.json`.
3. Stage явные пути, прочитай `git diff --cached` и создай conventional commit.
   `git add -A` допустим только для проверенного полного scope/snapshot.
4. Если push авторизован, проверь `origin`: ожидается
   `git@github.com:<owner>/<repo>.git`. Выполни SSH preflight:

   ```bash
   GIT_SSH_COMMAND='ssh -o BatchMode=yes -o PreferredAuthentications=publickey' \
     git ls-remote origin HEAD
   ```

5. При успехе отправь проверенную ветку:

   ```bash
   GIT_SSH_COMMAND='ssh -o BatchMode=yes -o PreferredAuthentications=publickey' \
     git push origin <branch>
   ```

При ошибке SSH сохрани commit и сообщи причину; HTTPS/token fallback запрещён.
Сообщи hash, branch, remote, проверки и результат push. PR/merge/deploy выполняй
только в пределах отдельной авторизации соответствующего действия.
