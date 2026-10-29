# CKB Pulse

Live GitHub activity of the CKB ecosystem, drawn in 3D.

Each project is a block that lights up when people work on it. Live, last 24 hours or last 7 days. English, 中文, Português. The counters at the top open the same picture as lists of projects and people, for keyboards and screen readers.

https://pulse-lab.lusocryptolabs.com

## Run

```sh
npm install
GITHUB_TOKEN=<read-only token> node server.mjs
```

Node 20 or later. Two dependencies: resvg draws the share pictures, web-push sends browser notices (its keys are made on first start in `DATA_DIR/vapid.json`). `PORT` defaults to 8080, `DATA_DIR` to `./data`. `PUBLIC_URL` is the address the digest, the feed and Telegram name (without it, the one each request came to).

## Test

```sh
npm test
```

The rules (what counts as CKB work, manifests, the burst cap, agents and schedules), the words in every language, the share cards, the badges, the digest page and the feed, the visit counts, the long history, and no long dashes. CI runs them on every push.

`GET /health` answers 200 while the server lives; `collector.ok` turns false when no organisation feed has answered for 10 minutes. It also carries today's visits.

## Visits

Page views and visitors per day for the page, the Fiber map, the digest, the feed and the badges, at `GET /api/visits` (30 days) and in `DATA_DIR/visits.json` (90 days). No cookies and no accounts: a visitor is a hash of the day's salt, the address and the browser, and the salt and the hashes are dropped when the day ends, so only the counts remain. Uptime checks, crawlers, link previews, scripts and headless browsers count apart, as `bots`, by their user agent: on 2026-10-26 they made 1997 of the page's views, while its script was fetched 26 times.

## What it follows

- The organisations and accounts in `config.mjs`, polled every minute with ETags. An account's repositories are read one by one, since its own feed only lists what that account did.
- GitHub delays its events API by 30 seconds to several hours, so neither can this page be faster.
- Builders: public repositories that depend on CKB libraries (CCC, Lumos, Spore, RGB++, JoyID, the JS, Go and Java SDKs, ckb-std, ckb-types, ckb-testtool and others, listed in `config.mjs`) or carry CKB topics, found by search every 6 hours.
- Only public repositories. A repository that turns private leaves the page with its first private event, or at the latest within 6 hours, its stored work included. Owners with no human activity in 30 days are hidden.
- Automatic work shows as grey sparks and stays out of the counts and medals: bots; what AI agents push, branch and propose on their own branches (`claude/`, `codex/`, `copilot/`, `cursor/`, `devin/`, and Claude Code's cloud `ccr-` branches), while merging their work still counts; and a commit title one account pushes to one project on 15 or more days of the last 30.
- People at work in followed repositories are checked for CKB projects of their own once a week, and anyone can suggest an organisation or a person on the page. Either joins when GitHub shows public CKB work (topics, names, or a CKB dependency) from the last 30 days. `BLOCKED` in `config.mjs` keeps an owner off.
- Once a day each followed repository's own event list fills the week, since an organisation's feed keeps only its last 300 events.

## History

The events API reaches back 90 days. Months and years come from GitHub's contributor statistics: commits per week and author for every known CKB repository, quiet ones included, refreshed weekly into `DATA_DIR/history.json`. From them: active developers per month (a commit in the month), new developers (their first commit among these repositories) and commits, two years back; and commits per month for each project.

Every repository read once stays counted after it goes quiet or leaves the page. Projects that stopped before this page began are still missing, so older months read low and the growth looks larger than it was.

## On chain

Once a day: every script the CKB explorer knows with a source repository (its repository is then followed too), and the mainnet contracts projects record in their committed ckb-cli migrations, measured on a public CKB node (`CKB_RPC`, default mainnet.ckb.dev): CKB in live cells that use each one and its last use. Shown in each project's card, with a tag in the scene.

## Fiber

`/fiber` maps the Fiber payment network on mainnet and testnet. Nodes, public channels and their updates come from a Fiber node of your own that only listens (no channels, no funds, auto-accept off): set `FIBER_MAINNET_RPC` and `FIBER_TESTNET_RPC` to its RPC. Openings and closings come from the chain block by block, as cells under Fiber's FundingLock appear and are spent, so private channels count there too (`CKB_RPC`, `CKB_TESTNET_RPC`). Payments travel encrypted between nodes and are not visible.

Gossip fills in slowly. Measured on testnet on 2026-10-10: a new listening node had 317 channels after 2 minutes and 537 more when their nodes announced them again 20 minutes later (that wave carried updates 41 minutes old). Outside the wave, channel updates reached it 14 to 62 s after their own timestamp (6 in 90 minutes). Openings and closings come from the chain, which is the fast path.

## New projects and following

A followed public repository created in the last 14 days is a new project: it is listed under New and announced once to the open pages. Forks are not. Outside the followed organisations, a new repository needs chain words in its name, description or topics. "ckb" alone does not make a repository CKB work (it is also Central Kurdish and a Codebase Knowledge Base format), and neither does the fiber-network topic, which optical fibre projects use too.

Visitors follow projects and people on their device, without an account. With browser notices allowed, the server sends one when something followed moves (at most once per project in ten minutes) and, on request, when a new project appears. On iPhone that needs the page on the Home Screen.

## Digest, feed and badges

`/digest?p=day|week|month` is the period's highlights as a plain page, in the three languages (`lang=`), to read, forward or print, with its own link preview. Every Monday at 08:00 UTC the week's highlights are kept in `DATA_DIR/digests.json` (a year of them; the first one as soon as the page has a week of work), and `/feed.xml` is an Atom feed of those weeks and of the new projects, for feed readers. With `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `PUBLIC_URL` set, the weekly digest is also posted to that chat, picture first, in `DIGEST_LANG` (en).

Badges are the last 7 days as a small SVG for a README or a site, grey when quiet or not followed, kept 10 minutes:

```md
[![CKB Pulse](https://pulse-lab.lusocryptolabs.com/badge/repo.svg?name=owner/repo)](https://pulse-lab.lusocryptolabs.com/?repo=owner/repo)
[![CKB Pulse](https://pulse-lab.lusocryptolabs.com/badge/person.svg?login=someone)](https://pulse-lab.lusocryptolabs.com/?person=someone)
[![CKB Pulse](https://pulse-lab.lusocryptolabs.com/badge/ckb.svg)](https://pulse-lab.lusocryptolabs.com/)
```

Each project's and person's card on the page shows its badge with the markdown to copy.

## The scene

The independent builders, the largest cluster, sit by language: each language with four or more repositories gets its own small grid with a label, the rest share one. On a first visit the camera flies to the project and the person of the week before settling; any touch ends the flight.

On a phone the projects are bars by default: one row per project with work by people, as long as that work (square root) and in the colours of its kinds, with the faces of who did it at the end. Rows slide to their new place as work arrives, and hold still while a finger is on the list. A switch above them turns to the scene and back, and the choice is kept on the device. The scene is not drawn while the bars are up.

In the scene, a phone frames it into whatever the panels leave free, and the panel is a sheet at the bottom: drag its bar to a peek, to half the screen or to the top; past half, the ticker steps aside. The timeline and the sheet keep clear of the home indicator.

A tidier layout is on trial at `?ui=next` (and `?ui=old` turns it off; the choice is kept in the browser): bars on every screen, filters behind a button, 24 hours and 7 days show the whole period at once while the play button replays it, the strip above the timeline only while it says something the panel does not, and the README badge folded under "For developers".

## Share

A link to a period's highlights (`?h=day|week|month`), a project (`?repo=owner/name`) or a person (`?person=login`) opens the page on it, and its preview is a 1200 x 630 picture drawn by the server. Medals ignore bursts: per person, project and hour at most 10 updates count, and opening a branch never does.

## API

- `GET /api/state`: repositories, highlights, 7 days of history; built at most once a minute, with an ETag (send `If-None-Match` for a 304 when nothing changed)
- `GET /api/repo?name=owner/repo`: one repository, 30 days; the name in any case, the answer with the spelling kept
- `GET /api/stream`: new events, Server-Sent Events
- `GET /og/highlights.png?p=`, `/og/repo.png?name=`, `/og/person.png?login=`, each with `lang=en|pt|zh`: share pictures
- `GET /api/push/key`, `POST /api/push` with `{sub, repos, people, news, lang}`, `POST /api/push/off` with `{endpoint}`: browser notices
- `GET /api/fiber?net=mainnet|testnet`: the Fiber map, channels open on chain, a week of openings and closings
- `GET /api/fiber/stream`: Fiber changes as they happen, Server-Sent Events
- `GET /version.json`: the build the server runs, for the new-version notice
- `POST /api/propose` with `{"login"}`, then `GET /api/propose?id=`: a suggestion and how its check went
- `GET /digest?p=day|week|month&lang=`: the highlights as a page; `GET /feed.xml?lang=`: the Atom feed
- `GET /badge/repo.svg?name=`, `/badge/person.svg?login=`, `/badge/ckb.svg`, each with `lang=`: badges
- `GET /api/visits`: views and visitors per day, 30 days

## Another ecosystem

Almost everything that says "CKB" lives in `config.mjs` (the organisations, the searches, the vetting words, the tags) and in the group names in `public/words.js`. The on-chain and Fiber parts are CKB's own; without their variables they stay quiet. Point the configuration at another ecosystem's organisations and libraries and the same page follows it.

## License

MIT. Three.js (MIT) and d3 (ISC) are vendored in `public/vendor` under their own licences.
