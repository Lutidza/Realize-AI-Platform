#!/usr/bin/env bash

set -Eeuo pipefail

: "${REALIZE_IMAGE:?REALIZE_IMAGE is required}"
: "${RELEASE_ID:?RELEASE_ID is required}"

if [[ ! "${REALIZE_IMAGE}" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]]; then
  echo "REALIZE_IMAGE must be an immutable GHCR digest reference" >&2
  exit 2
fi
if [[ ! "${RELEASE_ID}" =~ ^[A-Za-z0-9._-]{1,128}$ ]]; then
  echo "RELEASE_ID must be a safe release identifier" >&2
  exit 2
fi

deploy_root="${DEPLOY_ROOT:-$PWD}"
cd "${deploy_root}"

if [[ ! -f compose.yaml || ! -f .env ]]; then
  echo "compose.yaml and a pre-provisioned .env are required in ${deploy_root}" >&2
  exit 3
fi

mkdir -p .release/backups
exec 9> .release/deploy.lock
flock -n 9 || {
  echo "Another deployment is already running" >&2
  exit 4
}

candidate_file="$(mktemp .release/candidate.XXXXXX)"
cleanup() {
  rm -f "${candidate_file}"
}
trap cleanup EXIT

{
  printf 'REALIZE_IMAGE=%s\n' "${REALIZE_IMAGE}"
  printf 'RELEASE_ID=%s\n' "${RELEASE_ID}"
} > "${candidate_file}"

compose_candidate=(docker compose --env-file .env --env-file "${candidate_file}" -f compose.yaml)

"${compose_candidate[@]}" pull web
"${compose_candidate[@]}" up -d postgres

backup_path=".release/backups/${RELEASE_ID}.dump"
"${compose_candidate[@]}" exec -T postgres sh -c \
  'pg_dump --format=custom --username="$POSTGRES_USER" "$POSTGRES_DB"' > "${backup_path}"
chmod 600 "${backup_path}"

"${compose_candidate[@]}" run --rm --no-deps web npm run payload:migrate

if [[ -f .release/current.env ]]; then
  cp .release/current.env .release/previous.env
fi

mv "${candidate_file}" .release/current.env
trap - EXIT

compose_current=(docker compose --env-file .env --env-file .release/current.env -f compose.yaml)
"${compose_current[@]}" up -d --remove-orphans postgres web

ready=false
for _ in $(seq 1 30); do
  if "${compose_current[@]}" exec -T web node -e \
    "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    ready=true
    break
  fi
  sleep 2
done

if [[ "${ready}" != true ]]; then
  echo "Readiness failed; restoring the previous image reference" >&2
  cp .release/current.env .release/failed.env
  if [[ -f .release/previous.env ]]; then
    cp .release/previous.env .release/current.env
    docker compose --env-file .env --env-file .release/current.env -f compose.yaml up -d web

    rollback_ready=false
    for _ in $(seq 1 30); do
      if docker compose --env-file .env --env-file .release/current.env -f compose.yaml \
        exec -T web node -e \
        "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
        rollback_ready=true
        break
      fi
      sleep 2
    done
    if [[ "${rollback_ready}" != true ]]; then
      echo "Previous image also failed readiness" >&2
      exit 6
    fi
  else
    "${compose_current[@]}" stop web || true
    rm -f .release/current.env
  fi
  exit 5
fi

"${compose_current[@]}" ps
echo "Deployment ${RELEASE_ID} completed"
