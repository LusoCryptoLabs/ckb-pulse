# CKB Pulse

Live GitHub activity across the CKB ecosystem, in 3D. Every repository is a column of light that grows with its last 24 hours; each push, pull request, issue or release is a comet from the person (an avatar in orbit) to the repository, with a ring and a wave through its neighbours.

- When nothing is happening, it replays the last 24 hours, marked REPLAY; a live event interrupts.
- The timeline holds 7 days: drag to any moment (PAUSED), play it at 10 min, 1 h or 4 h per second, or go back to LIVE.
- Click a cell (or search) for the repository: 30 days of activity, people, latest events. Click an avatar for the person.
- Filters by keyword (ckb, fiber, dob/spore, rgb++, ccc, nervos), by kind of event, and automation on or off.
- `lite.html` is the 2D page (also the fallback without WebGL 2).

Three.js 0.186.1 is vendored in `public/vendor` (licence alongside), loaded through an import map; no CDN.

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

- `GET /` the 3D page, `GET /lite.html` the 2D page.
- `GET /api/state` (gzipped): repositories, counters, the latest events with titles and links, the last 24 h, and 7 days of compact history rows `[unix seconds, kind, repo index, actor index, bot, title]` with the actors and their avatars.
- `GET /api/repo?name=owner/repo`: one followed public repository from stored data (no GitHub call): 30 days of daily counts, people, latest events.
- `GET /api/stream` new events as Server-Sent Events, `GET /health`.

Privacy: the token can see private repositories, so the server records the visibility GitHub reports and shows only repositories with `private: false` (two private names leaked to the test page on 2026-10-09 before this rule; fixed the same hour). Code search only counts a dependency in the project's own manifest (root or up to three levels, not `database/`, `vendor/` and the like).

## Deploy

On the Compartmentalizer PaaS (see the `deploy` skill): the app builds from this repository's `main`, with `GITHUB_TOKEN` in its env and its state on the platform volume at `/app/data`.

- Test: app `pulse-lab`, https://pulse-lab.compartmentalizer.lusocryptolabs.com
- Production: https://pulse.cellula.id, once the test version has been looked at on a phone (`*.cellula.id` already points at the VPS).

Ship with `POST /apps/{id}/build` (a `redeploy` only restarts the old container). After a build the live stream reconnects by itself; the state survives on the volume.
