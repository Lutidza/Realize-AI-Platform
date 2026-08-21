# 18. Production deployment и rollback

## 18.1. Рекомендуемый rollout

Для Docker-based single-tenant установки:

- blue/green slots;
- reverse proxy переключает traffic;
- предыдущий image остаётся доступен до завершения verification window.

## 18.2. Deployment manifest

```ts
interface ReleaseManifest {
  releaseID: string
  installationID: string
  changeRequestID: string
  gitCommit: string
  imageDigest: string
  sbomDigest: string
  signatureRef: string
  migrations: Array<{
    id: string
    checksum: string
    direction: 'up'
  }>
  configVersion: string
  pluginVersions: Record<string, string>
  createdAt: string
}
```

## 18.3. Post-deploy checks

- app health;
- Payload health;
- DB connectivity;
- migration head;
- homepage;
- catalog page;
- product page;
- cart operation;
- admin login;
- critical API;
- error rate;
- latency;
- queue connectivity.

## 18.4. Rollback types

### Application rollback

Переключить traffic на previous signed image digest.

### Data operation rollback

Применить inverse operation или before snapshot в новой transaction.

### Schema rollback

Не считать `down` migration главным механизмом.

Предпочтение:

- expand-contract;
- backward-compatible schema;
- forward fix;
- application rollback без удаления новой schema;
- restore backup только как контролируемая аварийная процедура.

### Content rollback

Использовать Payload versions/drafts либо сохранённый before snapshot.

## 18.5. Автоматический rollback

Допустим при:

- failed health check до traffic switch;
- crash loop нового slot;
- невозможности загрузить app;
- критическом smoke failure.

После успешного traffic switch и data migration автоматический rollback ограничивается policy и может требовать оператора.

---

