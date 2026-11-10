#!/usr/bin/env bash
# Example desk binder (Git Bash / Linux). The dashboard uses its OWN Dockerfile.
# Place this in the frontend repo. FRONTEND_MODULE_DIR points at the clone
# (sibling folder or /opt/frontend). DASHBOARD_MODULE_DIR is the older name.
#
# Requires explicit UPSTREAM_* host:port values (no scheme, no invented defaults).
# Builds and runs this image only. It does not start other services.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_MODULE_DIR="${FRONTEND_MODULE_DIR:-${DASHBOARD_MODULE_DIR:-$(cd "$ROOT/.." && pwd)}}"
NETWORK="${QUANT_NETWORK:-quant_net}"
NGINX_CONF="${NGINX_CONF:-nginx.conf}"

: "${UPSTREAM_BACKEND:?Set UPSTREAM_BACKEND (host:port, e.g. backend:8010 or host.docker.internal:8010)}"
: "${UPSTREAM_PORTFOLIO:?Set UPSTREAM_PORTFOLIO (host:port, e.g. portfolio_generator:8011)}"
: "${UPSTREAM_RMS:?Set UPSTREAM_RMS (host:port, e.g. rms:8001)}"

case "$NGINX_CONF" in
  nginx.mock.conf)
    : "${UPSTREAM_TOE:?Set UPSTREAM_TOE (host:port, e.g. toe:8002)}"
    ;;
  nginx.broker.conf)
    : "${UPSTREAM_TOE_DHAN:?Set UPSTREAM_TOE_DHAN (host:port, e.g. toe_dhan:8003)}"
    ;;
  nginx.conf)
    : "${UPSTREAM_TOE:?Set UPSTREAM_TOE (host:port, e.g. toe:8002)}"
    : "${UPSTREAM_TOE_DHAN:?Set UPSTREAM_TOE_DHAN (host:port, e.g. toe_dhan:8003)}"
    ;;
  *)
    echo "Unknown NGINX_CONF: $NGINX_CONF (expected nginx.conf, nginx.mock.conf, or nginx.broker.conf)" >&2
    exit 1
    ;;
esac

docker network create "$NETWORK" 2>/dev/null || true

if [[ ! -f "$FRONTEND_MODULE_DIR/Dockerfile" ]]; then
  echo "Missing Dashboard Module Dockerfile at: $FRONTEND_MODULE_DIR" >&2
  exit 1
fi

echo "Building dashboard-module from $FRONTEND_MODULE_DIR (NGINX_CONF=$NGINX_CONF)"
docker build \
  --build-arg "NGINX_CONF=$NGINX_CONF" \
  --build-arg "VITE_BASE_PATH=${VITE_BASE_PATH:-/}" \
  --build-arg "VITE_DESK_PROFILE=${VITE_DESK_PROFILE:-}" \
  --build-arg "VITE_DEFAULT_BROKER=${VITE_DEFAULT_BROKER:-mock}" \
  --build-arg "VITE_BROKER_BOOK_LABEL=${VITE_BROKER_BOOK_LABEL:-}" \
  --build-arg "VITE_DESK_ENV=${VITE_DESK_ENV:-}" \
  -t dashboard-module:local \
  "$FRONTEND_MODULE_DIR"

docker rm -f dashboard 2>/dev/null || true

run_args=(
  -d
  --name dashboard
  --network "$NETWORK"
  --add-host=host.docker.internal:host-gateway
  -p "${DASHBOARD_PORT:-3005}:80"
  -e "UPSTREAM_BACKEND=$UPSTREAM_BACKEND"
  -e "UPSTREAM_PORTFOLIO=$UPSTREAM_PORTFOLIO"
  -e "UPSTREAM_RMS=$UPSTREAM_RMS"
)

if [[ -n "${UPSTREAM_TOE:-}" ]]; then
  run_args+=(-e "UPSTREAM_TOE=$UPSTREAM_TOE")
fi
if [[ -n "${UPSTREAM_TOE_DHAN:-}" ]]; then
  run_args+=(-e "UPSTREAM_TOE_DHAN=$UPSTREAM_TOE_DHAN")
fi

docker run "${run_args[@]}" dashboard-module:local

echo "Dashboard up on :${DASHBOARD_PORT:-3005}"
