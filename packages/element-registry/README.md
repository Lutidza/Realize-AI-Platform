# @realize/element-registry

Версия пакета **0.1.0**. Первый срез реализует явную регистрацию логических
владельцев: терминальный project root, package owners и проверенные bindings
к переданным host metadata. Module owners и полный каталог элементов пока
не реализованы.

- `@realize/element-registry` — browser-safe schemas/types, tuple identity key
  и `OwnerRegistryError`; без Node, React, Payload или AI runtime.
- `@realize/element-registry/server` — `createOwnerRegistry(input)` и
  `resolveElementOwner(snapshot, ownerRef)`. Node используется только для SHA-256.

Host явно передаёт root registration и trusted package metadata; строки
manifest не назначают authority. Compiler проверяет весь ownership graph,
включая неиспользуемые регистрации, точные package name/version и требуемые
public exports. Package owner может существовать без delivery binding.

Snapshot detached и рекурсивно заморожен. Hash не зависит от порядка
registrations, bindings, required exports или metadata. Он включает точные
target paths выбранных public exports; невыбранные exports и исходный полный
список trusted metadata в snapshot не входят. Для lookup используется snapshot,
созданный compiler, а не произвольный JSON с похожими полями.

Результат lookup не подтверждает установку, readiness, подпись артефакта или
права actor и не предоставляет execution grants. Пакет не читает filesystem,
env или БД, не импортирует code по строкам и не создаёт installer/API endpoints.

Identity сравнивается как точная пара `namespace` и `id`. ASCII tokens
`[A-Za-z0-9][A-Za-z0-9._-]*` сохраняют legacy camelCase; bounds 63/256.
Нормализация через trim/lowercase не выполняется. Package version проверяется
как точный SemVer до 128 символов; guide/definition versions этим срезом
не переопределяются. Диагностика содержит стабильные code и JSON pointer path,
без echo исходных значений.

Канонические правила:
[Declarative-first §§7.5.1–7.5.2](../../documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md#751-идентичность-владелец-и-версии).
