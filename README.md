# CKB Pulse

Live GitHub activity across the CKB ecosystem. Every repository is a cell; each push, pull request, issue, release or new repository lights its cell up, and a live feed lists what happened.

## What it follows

- The organisations in `config.mjs` (`ORGS`), read every minute from their public event feeds.
- Builders: repositories outside those organisations that depend on CKB libraries (`@ckb-ccc/core`, `@spore-sdk/core`, `@rgbpp-sdk/ckb`, `@ckb-lumos/lumos`, `ckb-std`, `ckb-sdk`) or carry CKB topics. Found by code and topic search every 6 hours; forks, archived repos and repos without a push in 180 days are left out. Each builder is read once per 10-minute cycle.
- Bots and automated reviewers are left out (renovate, dependabot, github-actions, Copilot), except for releases. Pushes to `gh-pages` too.
- Keyword tags (`TAGS`): ckb, fiber, dob/spore, rgb++, ccc, nervos. On their own across GitHub, "ckb", "dob" and "fiber" are mostly noise (Central Kurdish, date of birth, React Fiber), so tags are only applied inside the followed repositories.

Measured on 2026-10-09: 610 candidate repositories, 166 active builders, 91 organisation repositories pushed in the last year; 258 cells.

## How it reads GitHub

The Events API now sends trimmed payloads: pushes carry only the head commit, pull requests only their number. The server fetches the PR title and the head commit message once per event and caches them. Event feeds are read with ETags, so an unchanged feed costs nothing against the rate limit.

## Run

```
GITHUB_TOKEN=... node server.mjs      # PORT (8080), DATA_DIR (./data)
```

Node 20 or later, no dependencies. `GITHUB_TOKEN` only needs read access to public repositories (a fine-grained token with no repository permissions works). State is saved to `DATA_DIR/state.json` every minute and on discovery.

- `GET /` the page, `GET /api/state` the current state, `GET /api/stream` new events as Server-Sent Events, `GET /health`.
