# 26. CI/CD pipeline

- **Статус:** target specification
- **Current baseline:** GitHub Actions, GHCR и exact-digest deployment уже присутствуют

## 26.1. Source gates

Pull Request выполняет runtime verification, formatting, lint, typecheck,
integration tests, build, migration checks, security/dependency scan и
profile-specific tests по scope. Generated artifacts и dirty diff после
проверок запрещены.

## 26.2. Release candidate

Release строится из exact commit в trusted CI:

1. reproducible application image;
2. SBOM и provenance;
3. vulnerability policy;
4. signature verification;
5. manifest/migration/config compatibility hashes;
6. immutable registry digest;
7. production-like release preview и health evidence.

Candidate identity не выводится из mutable tag.

## 26.3. Promotion

Staging и production используют один digest. Production требует environment
approval и отдельный Realize `PRODUCTION_AUTHORIZATION` exact candidate.
CI credential, worker credential и deploy credential разделены.

## 26.4. Rollback

Workflow хранит previous known-good digest и release metadata. Failed readiness
возвращает application digest, но не выполняет автоматический database restore.
Rollback evidence и operator action входят в audit.
