# daily-tools

Code repo for the `daily-tools` project.

Governance, docs, and coordination for this project live in the umbrella
**upper repo** [`daily-tools-memory`](https://github.com/sam101010101010/daily-tools-memory)
(ADRs, plans, progress logs, workstream registry). This repo holds the actual
code only.

## Working on this repo

Code work is done on `ws/<id>` branches driven from the upper repo's claim
handshake (`scripts/claim.sh <id> --repo daily-tools`), then merged via PR.
Don't commit feature work straight to `main`.

Project purpose and entry points — TBD, filled in as the first workstream lands.
