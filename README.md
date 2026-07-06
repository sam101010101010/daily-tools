# daily-tools

Code repo for the `daily-tools` project — a website aggregating everyday
small tools (JSON processing, Base64, SSL certificate checking, DNS
lookup...). The homepage is a searchable/manageable tool list; clicking a
tool routes to its own tool page.

Governance, docs, and coordination for this project live in the umbrella
**upper repo** [`daily-tools-memory`](https://github.com/sam101010101010/daily-tools-memory)
(ADRs, plans, progress logs, workstream registry). This repo holds the actual
code only.

## Architecture

React + Vite SPA driven by a central tool registry, behind a single Caddy
layer that both serves the static frontend and reverse-proxies
`/api/<lang>/<tool>` to per-language backend services. v1 ships one Java
(Spring Boot) service. See [ADR-0001](https://github.com/sam101010101010/daily-tools-memory/blob/main/adr/0001-daily-tools-architecture.md)
for the full design and [ADR-0002](https://github.com/sam101010101010/daily-tools-memory/blob/main/adr/0002-deploy-ci-cd.md)
for deploy/CI-CD.

## Running the whole stack

```bash
docker compose up --build
```

This builds and starts two services:
- `web` — Caddy, serving the built frontend as static files on `:8088` and
  routing `/api/java/*` through to `backend-java`.
- `backend-java` — the Spring Boot service (internal only, not published to
  the host).

Visit `http://localhost:8088/`.

## Dev workflow (without Docker)

Run frontend and backend separately, each with its own toolchain:

- **Frontend** (`frontend/`): `npm run dev` (requires Node 20+). Vite
  dev-proxies `/api` → `http://localhost:8080`, so the backend must be
  running for SSL/DNS tools to work in dev.
- **Backend** (`backend-java/`): `mvn spring-boot:run` (requires JDK 21).
  Listens on `:8080`.

Tests: `npm test` (frontend, Vitest) and `mvn test` (backend, JUnit5 +
Mockito) — both run without touching the network.

## Extending

- **Add a tool**: drop a new `frontend/src/tools/<id>/` module and register
  one `ToolMeta` entry in `frontend/src/registry/`. The homepage, search, and
  routing all derive from the registry — no hand-wiring.
- **Add a backend language**: attach at the Caddy gateway layer per the
  onboarding contract in ADR-0001 — one `handle /api/<lang>/*` block in
  `gateway/Caddyfile` plus one more service in `docker-compose.yml`. The
  frontend never hardcodes a backend host/port; it always calls
  `/api/<lang>/<tool>` same-origin.

## Working on this repo

Code work is done on `ws/<id>` branches driven from the upper repo's claim
handshake (`scripts/claim.sh <id> --repo daily-tools`), then merged via PR.
Don't commit feature work straight to `main`.
