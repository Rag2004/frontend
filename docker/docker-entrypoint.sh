#!/bin/sh
# Fail before nginx starts when a template upstream is missing, then hand off
# to the official image entrypoint (envsubst + nginx).
set -eu

template="${NGINX_ENVSUBST_TEMPLATE_DIR:-/etc/nginx/templates}/default.conf.template"
if [ ! -f "$template" ]; then
  echo "Missing nginx template: $template" >&2
  exit 1
fi

missing=""
for var in $(grep -o 'UPSTREAM_[A-Z][A-Z0-9_]*' "$template" | sort -u); do
  val=$(printenv "$var" 2>/dev/null || true)
  if [ -z "$val" ]; then
    missing="$missing $var"
  fi
done

if [ -n "$missing" ]; then
  echo "Missing nginx upstream env:$missing" >&2
  exit 1
fi

exec /docker-entrypoint.sh "$@"
