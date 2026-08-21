# 26. CI/CD pipeline

## 26.1. Baseline CI

На каждый pull request/AI branch:

1. checkout exact commit;
2. verify Node/npm versions;
3. `npm ci`;
4. lockfile integrity;
5. format check;
6. lint;
7. TypeScript check;
8. unit tests;
9. integration tests;
10. Payload config initialization;
11. generated types/import map drift check;
12. migration status;
13. Next build;
14. Playwright smoke;
15. secret scan;
16. dependency scan;
17. protected path policy;
18. artifact reports.

## 26.2. Release CI

После acceptance:

1. clean checkout;
2. full CI повторно на exact commit;
3. build image;
4. generate SBOM;
5. vulnerability scan;
6. attach provenance;
7. sign image;
8. push by digest;
9. write Release Manifest;
10. deploy preview if not already exact artifact;
11. bind release approval;
12. production deployment.

## 26.3. Нельзя пересобирать после release approval

Если build был повторён, digest изменился — требуется новое approval.

## 26.4. Check registry

`.ai/checks/**` должен получить machine-readable registry:

```yaml
check_id: payload-config-init
command: npm run payload:generate-types -- --check
applies_to:
  - schema_change
  - code_change
required: true
timeout_seconds: 300
artifacts:
  - report
failure_state: validation_failed
```

## 26.5. Dependency changes

При изменении `package.json`/lockfile:

- отдельный risk flag;
- version evidence;
- compatibility check;
- license scan;
- vulnerability scan;
- explicit approval;
- no broad `npm update`.

---

