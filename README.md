# CKB Pulse

Live GitHub activity across the CKB ecosystem, in 3D, written for people who have never opened GitHub. Every project is a block that grows and lights up with its recent work; each update is a comet from the person (an avatar above the scene) to the project, with a ring and a wave through its neighbours.

- A welcome card on the first visit explains the scene in plain words and the colours. The `?` button opens it again.
- English or Portuguese, from the browser language, with a switch on the welcome card. Kinds of work are named in plain words ("proposed a change to", "reported a problem or idea in") and grouped into five colours: code, proposals, problems and ideas, versions, stars.
- Three ways to look: Live, the last 24 hours, the last 7 days. A period plays from its start to now, holds the whole picture, then plays again. When nobody picked Live and nothing has happened for 10 minutes, the last 24 hours play on their own; a live update ends that replay. Dragging the timeline pauses anywhere in the week.
- The camera stays where the viewer puts it: drag to turn, pinch or scroll to zoom, the reset button goes back to the starting view.
- Highlights for the last 24 hours, 7 days and 30 days: most active projects, most commits, most pushes, most active people, people with most commits, most active organisations. The leaders wear medals in the scene ("Project of the week", "Person of the day") and in their cards.
- New projects (created in the last 7 days) and organisations that just showed up are marked as new.
- Filters for the kind of work, the topic (ckb, fiber, dob/spore, rgb++, ccc, nervos) and automatic activity: a bar under the header on wide screens, a panel behind the Filters button elsewhere.
- Names, medals and tags in the scene hide while they would cover each other or a panel.

Three.js 0.186.1 is vendored in `public/vendor` (licence alongside), loaded through an import map; no CDN. Without WebGL 2 the page says so; there is no 2D version.

## What it follows

- The organisations in `config.mjs` (`ORGS`), read every minute from their public event feeds.
- Builders: repositories outside those organisations that depend on CKB libraries (`@ckb-ccc/core`, `@spore-sdk/core`, `@rgbpp-sdk/ckb`, `@ckb-lumos/lumos`, `ckb-std`, `ckb-sdk`) or carry CKB topics. Found by code and topic search every 6 hours; forks, archived repos and repos without a push in 180 days are left out. Each builder is read once per 10-minute cycle. A builder owned by an organisation gets that organisation's own group; people go to "Independent builders".
- An owner (organisation or person) stays on the page while people work in its public repositories: with no human event in 30 days it leaves, and it comes back with the next one. On 2026-10-09 this took Magickbase, Nervina Labs and CKB JS off the page: their feeds held only renovate and github-actions events for the month.
- Bots and automated reviewers do not count as work (renovate, dependabot, github-actions, Copilot); they show as grey sparks, except releases. Pushes to `gh-pages` are ignored.
- Keyword tags (`TAGS`) are only applied inside the followed repositories: on their own across GitHub, "ckb", "dob" and "fiber" are mostly noise (Central Kurdish, date of birth, React Fiber).

## How it reads GitHub

The Events API now sends trimmed payloads: pushes carry only `before` and `head`, pull requests only their number. The server fetches the PR title and the head commit message once per event and caches them, and counts the commits in a push with one compare call (`before...head`). Pushes stored before commits were counted are looked up again in the repository's event list; one GitHub no longer lists counts as one commit, the least it can be. Event feeds are read with ETags, so an unchanged feed costs nothing against the rate limit.

## Run

```
GITHUB_TOKEN=... node server.mjs      # PORT (8080), DATA_DIR (./data)
```

Node 20 or later, no dependencies. `GITHUB_TOKEN` only needs read access to public repositories (a fine-grained token with no repository permissions works). State is saved to `DATA_DIR/state.json` every minute and on discovery.

- `GET /` the page.
- `GET /api/state` (gzipped): repositories (with `isNew`), groups (with `isNew`), counters, `leaders` for `day`, `week` and `month`, the latest events with titles and links, the last 24 h, and 7 days of compact history rows `[unix seconds, kind, repo index, actor index, bot, title, commits]` with the actors and their avatars.
- `GET /api/repo?name=owner/repo`: one followed public repository from stored data (no GitHub call): 30 days of daily counts, people, latest events.
- `GET /api/stream` new events as Server-Sent Events, `GET /health`.

Privacy: the token can see private repositories, so the server records the visibility GitHub reports and shows only repositories with `private: false` (two private names leaked to the test page on 2026-10-09 before this rule; fixed the same hour). Code search only counts a dependency in the project's own manifest (root or up to three levels, not `database/`, `vendor/` and the like).

## Deploy

On the Compartmentalizer PaaS (see the `deploy` skill): the app builds from this repository's `main`, with `GITHUB_TOKEN` in its env and its state on the platform volume at `/app/data`.

- Test: app `pulse-lab`, https://pulse-lab.compartmentalizer.lusocryptolabs.com
- Production: https://pulse.cellula.id, once the test version has been looked at on a phone (`*.cellula.id` already points at the VPS).

Ship with `POST /apps/{id}/build` (a `redeploy` only restarts the old container). After a build the live stream reconnects by itself; the state survives on the volume.
