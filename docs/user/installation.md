# Installation

Two paths: a pre-built Docker image (recommended once Epic 3.6 ships) or
a from-source development build.

## Docker

```bash
docker run --rm -p 8787:8787 ghcr.io/<owner>/lxi-web:latest
```

- Container binds to `0.0.0.0:8787`; the host port is whatever you map
  with `-p`.
- Open `http://localhost:8787/` in any modern browser.
- Image is also mirrored to Docker Hub (`<owner>/lxi-web:latest`).

### docker-compose

A reference `docker-compose.yml` ships in the repo root. Drop it next to
your other services and run `docker compose up -d`. It pins
`ghcr.io/lxi-web/lxi-web:latest`, exposes port `8787`, and defines a
container-level `/healthz` check.

### Verifying the image

Every release attaches a build-provenance attestation. Verify a
specific digest with [cosign](https://docs.sigstore.dev/cosign/installation/):

```bash
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-identity-regexp '^https://github.com/lxi-web/lxi-web/.github/workflows/release.yml@.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/lxi-web/lxi-web@sha256:<digest>
```

### Environment variables

| Variable     | Default         | Effect                                                 |
| ------------ | --------------- | ------------------------------------------------------ |
| `HOST`       | `127.0.0.1`     | Bind address for the API. Set to `0.0.0.0` in Docker.  |
| `PORT`       | `8787`          | TCP port.                                              |
| `WEB_DIST`   | (auto-detected) | Path to the built SPA. Set in the image to `/app/web-dist`. |
| `LOG_LEVEL`  | `info`          | Fastify log level (`trace` / `debug` / `info` / `warn` / `error`). |

## From source

Prerequisites:

- **Node.js ≥ 24**
- **pnpm ≥ 10**

```bash
git clone https://github.com/<owner>/lxi-web.git
cd lxi-web
pnpm install
pnpm dev
```

- Web UI: `http://localhost:5173/` (Vite dev server, hot reload).
- API:    `http://127.0.0.1:8787/`.

## Network posture

The server binds to `127.0.0.1` by default so it is **not** reachable
from the LAN. To access it from another machine, pass `HOST=0.0.0.0`:

```bash
HOST=0.0.0.0 PORT=8787 pnpm --filter @lxi-web/server dev
```

**Do not expose the API to the open internet.** There is no auth layer.
Treat the dashboard the same way you would treat an unauthenticated
local admin UI.

## Reverse proxies

Any HTTP reverse proxy works — the server speaks plain HTTP + WebSocket.
Make sure the proxy forwards `Upgrade` / `Connection` headers for
`/ws`. Point a TLS-terminating proxy (nginx, Caddy, Traefik) at the
container and do **not** expose the dashboard directly.

## Firewall / mDNS

Device discovery uses mDNS (UDP 5353). If the discovery list stays empty:

- the instrument is on a different subnet,
- multicast is disabled on the switch, or
- the host firewall blocks UDP 5353.

You can always add instruments manually by hostname / IP in the
**Add device** dialog.
