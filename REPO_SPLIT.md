# Dashboard Module is its own service

This tree is the dashboard extract (Vite/React UI, nginx reverse proxy, port 3005).
The image builds from this directory only. It does not import other modules.

Canonical remote: https://github.com/Rag2004/frontend

The in-tree copy (`QuantEngine_Frontend/dashboard`) remains the default Compose
build context until a desk sets `FRONTEND_MODULE_DIR`.

## Layout

- Own `Dockerfile` (build from this directory only)
- Zero source/filesystem coupling to sibling services
- Runtime contract: HTTP upstreams injected as `UPSTREAM_*` (`host:port`, no scheme)
- Desk orchestration is docker compose in the main QuantEngine repo, or
  `scripts/start_dashboard_module.sh`, which builds and runs this image only

## Upstream env

| Variable | Used by | Mock desk example |
|----------|---------|-------------------|
| `UPSTREAM_BACKEND` | all nginx configs | `backend:8010` |
| `UPSTREAM_PORTFOLIO` | all nginx configs | `portfolio_generator:8011` |
| `UPSTREAM_RMS` | all nginx configs | `rms:8001` |
| `UPSTREAM_TOE` | `nginx.conf`, `nginx.mock.conf` | `toe:8002` |
| `UPSTREAM_TOE_DHAN` | `nginx.conf`, `nginx.broker.conf` | `toe_dhan:8003` |

The container exits on start if a variable referenced by the selected nginx
template is unset. `NGINX_ENVSUBST_FILTER=^UPSTREAM_` limits substitution to
those names so nginx variables such as `$host` stay intact.

`nginx.mock.conf` has no Dhan TOE route. `nginx.broker.conf` has no mock TOE
route. `nginx.conf` has both.

## Cut over from monorepo

1. This directory is the root of
   [frontend](https://github.com/Rag2004/frontend).
2. On the desk server: clone beside the desk repo (`/opt/frontend`).
3. Set `FRONTEND_MODULE_DIR=/opt/frontend` in the desk `.env` so Compose
   builds that clone. The Dockerfile is at the clone root.
4. Stop treating monorepo `QuantEngine_Frontend/dashboard/` as source of truth.

Local default (no `FRONTEND_MODULE_DIR`) still builds the in-tree copy.
Compose sets the `UPSTREAM_*` values and the Vite build args for that desk.
`DASHBOARD_MODULE_DIR` is the older name of the same path.
