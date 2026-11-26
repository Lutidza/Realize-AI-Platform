# Подтверждение прав адаптера для назначения (AdapterAccessEvidenceV1)

**Статус.** Формат `AdapterAccessEvidenceV1` согласован. Оркестратор применяет одну проверку к подтверждениям сессии Codex и локально подготовленного запроса к модели по API. [Общий контракт](contract.md) · [Схема V1](../../../packages/ai-contracts/src/assignmentAccessEvidence.schemas.ts) · [Проверка допуска](../../../.ai/tools/worker-assignment/src/admission/assessAdapterAdmission.validator.ts)

## Основание проверки

Манифест выбранной ревизии назначения задаёт обязательные источники в `requiredSources` и область чтения в `reviewScope`. В подготовленный ввод входят тексты обязательных источников. Разрешение на чтение охватывает файлы из обоих списков. [Формат назначения](../../../.ai/templates/worker-assignment/TEMPLATE-WORKER-ASSIGNMENT-MANIFEST.md#сообщение-исполнителю)

Для нового назначения путь к его привязке передают через `--lock`. Поле `files` привязки задаёт разрешённые пути и их SHA-256. Оркестратор сверяет с ними фактические права исполнителя и проверяет, что нет пропусков, подмен и повторов. Исполнитель возвращает отчёт сообщением. [Привязка и повторное открытие](../../../.ai/tools/worker-assignment/README.md#привязка-и-повторное-открытие)

## Формат V1

Идентичность назначения и сведения о подготовленных источниках оркестратор получает из проверенного результата `bind`. До открытия транспорта он фиксирует попытку, выбранного исполнителя и вид привязки. Адаптер сообщает наблюдения для этой попытки. Входящее сообщение проверяется строгой схемой. [Экспортируемый тип](../../../packages/ai-contracts/src/AdapterAccessEvidence.types.ts)

```ts
type AdapterAccessEvidenceV1 = {
  schemaVersion: 1
  assignmentId: string
  revision: number
  contextId: string
  lockSha256: string
  attemptId: string
  executor: {
    adapterId: string
    providerId: string
    selection: { kind: "model" | "profile"; id: string }
    observedVersion: string | null
  }
  preparedSources: Array<{ path: string; sha256: string; bytes: number }>
  access: {
    coverage: "complete" | "partial" | "unknown"
    routes: Array<{ tool: string; via: "direct" | "nested" | "deferred" }> | null
    readPaths: string[] | null
    writePaths: string[] | null
    readsPinned: boolean | null
    outsideReadDenied: boolean | null
    writeDenied: boolean | null
  }
  observations: Array<{
    kind: "tool-catalog" | "dispatch-policy" | "read-probe" | "denial-probe"
    evidenceId: string
  }>
  binding: { kind: "session" | "request"; id: string } | null
  issues: Array<{ code: string; reason: string }>
}
```

- `attemptId` различает попытки одного назначения. `observedVersion` — версия CLI или клиента API, если её удалось установить. `preparedSources` содержит фактические размеры в байтах UTF-8 и SHA-256 текстов, прочитанных из подготовленного ввода.
- `coverage` показывает границу наблюдения. При `partial` все поля `access` описывают только проверенную часть, которую адаптер называет в `issues`. При `unknown` значения наблюдений равны `null`. Пустой массив означает проверенное отсутствие, `false` — установленное нарушение, `null` — отсутствие подтверждения.
- `tool` — идентификатор операции Realize после сверки с фактическим обработчиком. Для допуска в режиме `static-read-only` требуется ровно один маршрут `{ tool: "repo_read_file", via: "direct" }`. Дополнительный путь вызова того же инструмента учитывается отдельно. `readPaths` сверяются с ключами `files` в привязке. `readsPinned` означает проверку закреплённого SHA-256 на каждом чтении. `writePaths` должны быть пусты, все три проверки — подтверждены.
- `observations` связывает выводы с проверяемыми данными этой попытки. Каждый `evidenceId` оркестратор разрешает через доверенный адаптер. Для Codex источниками служат ответ каталога MCP и результаты проб. Для API нужны окончательный каталог модели, фактическая конфигурация диспетчера и результаты проверки reader. Если происхождение или область наблюдения установить нельзя, `complete` недопустим.
- `binding.id` — ссылка на подготовленное состояние у доверенного адаптера в пределах `attemptId`. Для сессии это включает действующий набор инструментов, для API — окончательный запрос с закреплёнными параметрами и набором обработчиков. Адаптер проверяет актуальность связи непосредственно при отправке. Одного идентификатора потока или хеша схемы инструмента недостаточно.
- Итог `ready` или `blocked` записывает оркестратор отдельно от сообщения адаптера. Основаниями отказа служат также неполный пакет, недоступная привязка и несовпадение выбора исполнителя. В отчёт достаточно включить идентификаторы, версии, пути, хеши и причины, без содержимого файлов и учётных данных.

## Два способа исполнить одно назначение

Ниже показаны три поля сообщения, по которым различаются решения. В обоих примерах `verifiedPaths` обозначает пути, полученные при проверке соответствующего исполнителя и сверенные с привязкой. Копирование ожидаемого списка из манифеста не подтверждает доступ.

```ts
type AccessDetail = Pick<AdapterAccessEvidenceV1, "access" | "binding" | "issues">
declare const verifiedPaths: string[]
declare const preparedRequestId: string

const codex: AccessDetail = {
  access: {
    coverage: "partial", routes: null, readPaths: verifiedPaths, writePaths: [],
    readsPinned: true, outsideReadDenied: true, writeDenied: true,
  },
  binding: null,
  issues: [{ code: "native_tools_unverified", reason: "Подтверждены только права MCP." }],
}

const apiAcceptanceExample: AccessDetail = {
  access: {
    coverage: "complete", routes: [{ tool: "repo_read_file", via: "direct" }],
    readPaths: verifiedPaths, writePaths: [],
    readsPinned: true, outsideReadDenied: true, writeDenied: true,
  },
  binding: { kind: "request", id: preparedRequestId },
  issues: [],
}
```

**Codex.** После успешных проб MCP служба `preflight` выдаёт первый вариант в поле `evidence`. Прямой маршрут до модели и полный каталог рабочего шага остаются неизвестны. Команда закрывает сессию. Оркестратор возвращает `blocked` с причиной `native_tools_unverified`. Ошибка связи во время пробы оставляет соответствующее право неподтверждённым. Положительный сценарий полной сессии воспроизводится только тестовым транспортом в памяти. [Проверка Codex](../../../.ai/tools/worker-assignment/src/preflightAssignment.service.ts)

**Модель по API.** Второй фрагмент соответствует локальной проверке окончательного тела запроса с `model`, одним сообщением и одним function tool. Адаптер передаёт идентичность провайдера и диспетчер, закреплённые за этим запросом. Сервис сверяет текст назначения и схему reader с точным `path.enum`, читает через диспетчер каждый файл выбранной привязки со сверкой SHA-256 и проверяет отказы для соседнего пути и записи. Затем он повторно проверяет актуальность запроса и обработчика. [Проверка запроса API](../../../.ai/tools/worker-assignment/src/admission/inspectApiAuditAdmission.service.ts)

Для рабочего OpenAI Chat Completions источник политики — зарегистрированный профиль с точным адресом, методом, провайдером и снимком модели. При неизвестной политике результат — `blocked / access_unverified`. Программная отправка проходит проверку заново в собственной попытке. [Профиль провайдера и происхождение политики](openai-chat-completions.md)

## Приёмка допуска без исполнителя

| Проверяемое условие | Решение |
| --- | --- |
| Полный каталог тестовой сессии Codex или локального запроса API, все четыре вида наблюдений, привязка актуальна | `ready` в пределах этой попытки |
| Подтверждена только сторона MCP у Codex | `blocked / native_tools_unverified` |
| Вложенный или отложенный маршрут, лишнее право, подмена пути или повтор в перечне | `blocked / transport_access_mismatch` |
| Файлы подготовленного пакета отличаются по составу, размеру или SHA-256 | `blocked / context_not_delivered` |
| Другая модель, профиль или провайдер | `blocked / executor_mismatch` |
| Наблюдение отсутствует, относится к другой попытке или противоречит фактам | `blocked / observation_unverified` |
| Сессия закрыта, запрос заменён или его привязка утратила силу | `blocked / binding_unavailable` |

В метаданные решения не входят текст задания, содержимое файлов и ключ API. Проверки используют временную копию закреплённых файлов. [Команда локальной проверки](../../../.ai/tools/worker-assignment/README.md#проверка-допуска-v1-без-исполнителя)
