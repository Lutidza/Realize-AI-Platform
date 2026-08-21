#!/usr/bin/env bash

set -Eeuo pipefail

deploy_root="${DEPLOY_ROOT:-$PWD}"
cd "${deploy_root}"

if [[ ! -f compose.yaml || ! -f .env || ! -f .release/current.env || ! -f .release/previous.env ]]; then
  echo "compose.yaml, .env, .release/current.env and .release/previous.env are required" >&2
  exit 2
fi

exec 9> .release/deploy.lock
flock -n 9 || {
  echo "Another deployment is already running" >&2
  exit 3
}

cp .release/current.env .release/failed.env
cp .release/previous.env .release/current.env

compose=(docker compose --env-file .env --env-file .release/current.env -f compose.yaml)
"${compose[@]}" pull web
"${compose[@]}" up -d web

for _ in $(seq 1 30); do
  if "${compose[@]}" exec -T web node -e \
    "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    "${compose[@]}" ps
    echo "Rollback completed"
    exit 0
  fi
  sleep 2
done

echo "Rollback target did not become ready; restoring the original image" >&2
cp .release/failed.env .release/current.env
restore=(docker compose --env-file .env --env-file .release/current.env -f compose.yaml)
"${restore[@]}" pull web
"${restore[@]}" up -d web
exit 4
