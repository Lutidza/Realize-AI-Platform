#!/usr/bin/env bash

set -Eeuo pipefail

mode="${1:-deploy}"
deploy_root="${PREVIEW_DEPLOY_ROOT:-$PWD}"

if [[ ! "${deploy_root}" =~ ^(/[A-Za-z0-9._-]+)+/realize-release-previews$ ]] ||
  [[ "${deploy_root}" == *"/../"* || "${deploy_root}" == *"/./"* || "${deploy_root}" == *"//"* ]]; then
  echo "PREVIEW_DEPLOY_ROOT must be a dedicated absolute */realize-release-previews path" >&2
  exit 2
fi

runtime_root="${deploy_root}/runtime"
shared_root="${deploy_root}/shared"
candidates_root="${deploy_root}/candidates"
compose_file="${runtime_root}/compose.release-preview.yaml"

mkdir -p "${candidates_root}"
exec 9> "${deploy_root}/.preview.lock"
flock -n 9 || {
  echo "Another preview operation is already running" >&2
  exit 3
}

project_name() {
  printf 'realize-preview-%s' "${1:0:12}"
}

compose_for() {
  local key="$1"
  local candidate_root="${candidates_root}/${key}"
  docker compose \
    --project-name "$(project_name "${key}")" \
    --env-file "${shared_root}/.env" \
    --env-file "${candidate_root}/candidate.env" \
    --file "${compose_file}" \
    "${@:2}"
}

remove_candidate_files() {
  local candidate_root="$1"
  [[ "${candidate_root}" == "${candidates_root}/"* ]]
  [[ "${candidate_root}" != "${candidates_root}" ]]
  find "${candidate_root}" -mindepth 1 -delete
  rmdir "${candidate_root}"
}

cleanup_candidate() {
  local key="$1"
  local candidate_root="${candidates_root}/${key}"
  [[ "${key}" =~ ^[a-f0-9]{64}$ ]]
  if [[ -f "${candidate_root}/candidate.env" ]]; then
    compose_for "${key}" down --volumes --remove-orphans >&2 || return 1
  fi
  remove_candidate_files "${candidate_root}"
}

cleanup_expired() {
  local now cleaned key candidate_root expires_at expires_epoch
  now="$(date -u +%s)"
  cleaned=0
  while IFS= read -r -d '' candidate_root; do
    key="$(basename "${candidate_root}")"
    [[ "${key}" =~ ^[a-f0-9]{64}$ ]] || continue
    [[ -f "${candidate_root}/expires-at" ]] || continue
    expires_at="$(<"${candidate_root}/expires-at")"
    expires_epoch="$(date -u -d "${expires_at}" +%s 2>/dev/null || printf '0')"
    if (( expires_epoch <= now )); then
      cleanup_candidate "${key}"
      cleaned=$((cleaned + 1))
    fi
  done < <(find "${candidates_root}" -mindepth 1 -maxdepth 1 -type d -print0)
  printf '{"schemaVersion":1,"cleaned":%d}\n' "${cleaned}"
}

if [[ "${mode}" == "cleanup" ]]; then
  [[ -f "${compose_file}" && -f "${shared_root}/.env" ]]
  cleanup_expired
  exit 0
fi
if [[ "${mode}" != "deploy" ]]; then
  echo "Usage: remote-release-preview.sh deploy|cleanup" >&2
  exit 2
fi

for command in curl date docker find flock ss; do
  command -v "${command}" >/dev/null || {
    echo "Required command is missing: ${command}" >&2
    exit 4
  }
done

: "${CANDIDATE_KEY:?CANDIDATE_KEY is required}"
: "${EXPIRES_AT:?EXPIRES_AT is required}"
: "${GIT_COMMIT:?GIT_COMMIT is required}"
: "${PREVIEW_BASE_DOMAIN:?PREVIEW_BASE_DOMAIN is required}"
: "${PREVIEW_PORT_MAX:?PREVIEW_PORT_MAX is required}"
: "${PREVIEW_PORT_MIN:?PREVIEW_PORT_MIN is required}"
: "${REALIZE_IMAGE:?REALIZE_IMAGE is required}"

[[ "${CANDIDATE_KEY}" =~ ^[a-f0-9]{64}$ ]]
[[ "${GIT_COMMIT}" =~ ^[a-f0-9]{40}$ ]]
[[ "${REALIZE_IMAGE}" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]]
[[ "${PREVIEW_BASE_DOMAIN}" =~ ^[a-z0-9]([a-z0-9.-]{1,251}[a-z0-9])?$ ]]
[[ "${PREVIEW_BASE_DOMAIN}" != *..* ]]
[[ "${PREVIEW_PORT_MIN}" =~ ^[0-9]{4,5}$ ]]
[[ "${PREVIEW_PORT_MAX}" =~ ^[0-9]{4,5}$ ]]
[[ "${PREVIEW_BIND_ADDRESS:-0.0.0.0}" =~ ^(0\.0\.0\.0|127\.0\.0\.1)$ ]]
(( PREVIEW_PORT_MIN >= 1024 && PREVIEW_PORT_MAX <= 65535 && PREVIEW_PORT_MIN <= PREVIEW_PORT_MAX ))

expires_epoch="$(date -u -d "${EXPIRES_AT}" +%s)"
now="$(date -u +%s)"
(( expires_epoch > now && expires_epoch <= now + 604800 )) || {
  echo "EXPIRES_AT must be within the next seven days" >&2
  exit 5
}

for path in \
  "${compose_file}" \
  "${runtime_root}/release-preview-nginx.conf" \
  "${shared_root}/.env" \
  "${shared_root}/auth/.htpasswd" \
  "${shared_root}/database/sanitized.dump" \
  "${shared_root}/tls/fullchain.pem" \
  "${shared_root}/tls/privkey.pem"; do
  [[ -f "${path}" ]] || {
    echo "Required preview asset is missing: ${path}" >&2
    exit 6
  }
done
[[ -d "${shared_root}/media" ]] || {
  echo "Sanitized preview media directory is missing" >&2
  exit 6
}

cleanup_expired >/dev/null

candidate_root="${candidates_root}/${CANDIDATE_KEY}"
install -d -m 700 "${candidate_root}"
port_file="${candidate_root}/port"
if [[ -f "${port_file}" ]]; then
  preview_port="$(<"${port_file}")"
  [[ "${preview_port}" =~ ^[0-9]{4,5}$ ]]
  (( preview_port >= PREVIEW_PORT_MIN && preview_port <= PREVIEW_PORT_MAX ))
else
  preview_port=""
  for ((port = PREVIEW_PORT_MIN; port <= PREVIEW_PORT_MAX; port++)); do
    owned=false
    while IFS= read -r existing_port_file; do
      [[ "${existing_port_file}" == "${port_file}" ]] && continue
      [[ "$(<"${existing_port_file}")" == "${port}" ]] && owned=true
    done < <(find "${candidates_root}" -mindepth 2 -maxdepth 2 -type f -name port)
    if [[ "${owned}" == false ]] && ! ss -H -ltn "sport = :${port}" | grep -q .; then
      preview_port="${port}"
      break
    fi
  done
  [[ -n "${preview_port}" ]] || {
    echo "Preview port pool is exhausted" >&2
    exit 7
  }
  printf '%s\n' "${preview_port}" > "${port_file}"
fi

preview_hostname="${CANDIDATE_KEY:0:16}.${PREVIEW_BASE_DOMAIN}"
preview_url="https://${preview_hostname}:${preview_port}"
candidate_env="${candidate_root}/candidate.env"
if [[ -f "${candidate_env}" ]]; then
  grep -Fxq "REALIZE_IMAGE=${REALIZE_IMAGE}" "${candidate_env}"
  grep -Fxq "GIT_COMMIT=${GIT_COMMIT}" "${candidate_env}"
  grep -Fxq "PREVIEW_HTTPS_PORT=${preview_port}" "${candidate_env}"
  grep -Fxq "PREVIEW_PUBLIC_URL=${preview_url}" "${candidate_env}"
else
  umask 077
  database_password="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  {
    printf 'CANDIDATE_KEY=%s\n' "${CANDIDATE_KEY}"
    printf 'GIT_COMMIT=%s\n' "${GIT_COMMIT}"
    printf 'PREVIEW_AUTH_FILE_PATH=%s\n' "${shared_root}/auth/.htpasswd"
    printf 'PREVIEW_BIND_ADDRESS=%s\n' "${PREVIEW_BIND_ADDRESS:-0.0.0.0}"
    printf 'PREVIEW_HTTPS_PORT=%s\n' "${preview_port}"
    printf 'PREVIEW_MEDIA_PATH=%s\n' "${shared_root}/media"
    printf 'PREVIEW_NGINX_CONFIG=%s\n' "${runtime_root}/release-preview-nginx.conf"
    printf 'PREVIEW_POSTGRES_DB=realize_preview\n'
    printf 'PREVIEW_POSTGRES_PASSWORD=%s\n' "${database_password}"
    printf 'PREVIEW_POSTGRES_USER=realize_preview\n'
    printf 'PREVIEW_PUBLIC_URL=%s\n' "${preview_url}"
    printf 'PREVIEW_TLS_CERT_PATH=%s\n' "${shared_root}/tls/fullchain.pem"
    printf 'PREVIEW_TLS_KEY_PATH=%s\n' "${shared_root}/tls/privkey.pem"
    printf 'REALIZE_IMAGE=%s\n' "${REALIZE_IMAGE}"
  } > "${candidate_env}"
fi
printf '%s\n' "${EXPIRES_AT}" > "${candidate_root}/expires-at"

failed=true
on_error() {
  local code=$?
  if [[ "${failed}" == true && -f "${candidate_env}" ]]; then
    compose_for "${CANDIDATE_KEY}" down --volumes --remove-orphans >&2 || true
    rm -f "${candidate_root}/restore-complete"
  fi
  exit "${code}"
}
trap on_error ERR

compose_for "${CANDIDATE_KEY}" pull >&2
compose_for "${CANDIDATE_KEY}" up -d postgres >&2
if [[ ! -f "${candidate_root}/restore-complete" ]]; then
  compose_for "${CANDIDATE_KEY}" exec -T postgres \
    pg_restore --clean --if-exists --no-owner --no-privileges \
    --username=realize_preview --dbname=realize_preview \
    < "${shared_root}/database/sanitized.dump" >&2
  touch "${candidate_root}/restore-complete"
fi
compose_for "${CANDIDATE_KEY}" run --rm --no-deps web npm run payload:migrate >&2
compose_for "${CANDIDATE_KEY}" up -d web proxy >&2

ready=false
for _ in $(seq 1 60); do
  if curl --fail --silent --show-error \
    --resolve "${preview_hostname}:${preview_port}:127.0.0.1" \
    "${preview_url}/api/health/ready" >/dev/null; then
    ready=true
    break
  fi
  sleep 2
done
[[ "${ready}" == true ]] || {
  echo "Release preview did not become HTTPS-ready" >&2
  exit 8
}

failed=false
trap - ERR
printf '{"candidateKey":"%s","gitCommit":"%s","healthSummary":"HTTPS readiness passed on isolated sanitized VPS Compose preview.","previewStatus":"healthy","previewURL":"%s","schemaVersion":1}\n' \
  "${CANDIDATE_KEY}" "${GIT_COMMIT}" "${preview_url}"
