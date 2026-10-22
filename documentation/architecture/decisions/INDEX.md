# Architecture Decision Log

Решения применяются в указанной последовательности:

1. [ADR-0001 — Active product contour](ADR-0001-active-product-contour.md)
2. [ADR-0002 — One tenant per installation](ADR-0002-single-tenant-per-installation.md)
3. [ADR-0003 — Central AI execution](ADR-0003-central-ai-execution.md)
4. [ADR-0004 — Payload AI plugin boundary](ADR-0004-payload-ai-plugin-boundary.md)
5. [ADR-0005 — Runtime and package manager](ADR-0005-runtime-and-package-manager.md)
6. [ADR-0006 — Migrations policy](ADR-0006-migrations-policy.md)
7. [ADR-0007 — MCP Phase 0/1 policy](ADR-0007-mcp-phase-0-policy.md)
8. [ADR-0008 — Commercial licensing direction](ADR-0008-commercial-licensing-direction.md)
9. [ADR-0009 — Delivery platform](ADR-0009-delivery-platform.md)
10. [ADR-0010 — OCI release control-plane boundary](ADR-0010-oci-release-control-plane.md)
11. [ADR-0011 — GitHub/GHCR/VPS release preview adapter](ADR-0011-github-ghcr-vps-release-preview.md)
12. [ADR-0012 — Admin integration registry](ADR-0012-admin-integration-registry.md)
13. [ADR-0013 — GitHub Pull Request source promotion](ADR-0013-github-pull-request-source-promotion.md)
14. [ADR-0014 — Universal site core and project profiles](ADR-0014-universal-site-core-and-project-profiles.md)
15. [ADR-0015 — Protected system AI layer and installation overlay](ADR-0015-protected-system-ai-layer-and-installation-overlay.md)
16. [ADR-0016 — Общий исполнитель Git и адаптеры доступа](ADR-0016-development-git-delivery-handler.md)
17. [ADR-0017 — Внутренний MCP и управление экземплярами серверов](ADR-0017-internal-mcp-and-server-management.md)
18. [ADR-0018 — Самодостаточные шаблонные пакеты и единый lifecycle](ADR-0018-self-contained-template-packages.md)

ADR-0001, 0005, 0006, 0007, 0009–0013 имеют статус `accepted`.
ADR-0002–0004, 0008, 0014–0018 имеют статус `accepted-as-target`.
Исторические ADR не переписываются: изменение решения оформляется новым ADR с
явной связью `supersedes/superseded by`.
