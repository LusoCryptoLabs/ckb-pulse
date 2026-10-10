# CKB Pulse

Live GitHub activity of the CKB ecosystem, drawn in 3D.

Each project is a block that lights up when people work on it. Live, last 24 hours or last 7 days. English, 中文, Português. The counters at the top open the same picture as lists of projects and people, for keyboards and screen readers.

https://pulse-lab.lusocryptolabs.com

## Run

```sh
npm install
GITHUB_TOKEN=<read-only token> node server.mjs
```

Node 20 or later. Two dependencies: resvg draws the share pictures, web-push sends browser notices (its keys are made on first start in `DATA_DIR/vapid.json`). `PORT` defaults to 8080, `DATA_DIR` to `./data`.

## Test

```sh
npm test
```

The rules (what counts as CKB work, manifests, the burst cap, agents and schedules), the words in every language, the share cards, and no long dashes. CI runs them on every push.

`GET /health` answers 200 while the server lives; `collector.ok` turns false when no organisation feed has answered for 10 minutes.

## What it follows

- The organisations and accounts in `config.mjs`, polled every minute with ETags. An account's repositories are read one by one, since its own feed only lists what that account did.
- GitHub delays its events API by 30 seconds to several hours, so neither can this page be faster.
- Builders: public repositories that depend on CKB libraries (CCC, Lumos, Spore, RGB++, JoyID, the JS, Go and Java SDKs, ckb-std, ckb-types, ckb-testtool and others, listed in `config.mjs`) or carry CKB topics, found by search every 6 hours.
- Only public repositories. Owners with no human activity in 30 days are hidden.
- Automatic work shows as grey sparks and stays out of the counts and medals: bots; what AI agents push, branch and propose on their own branches (`claude/`, `codex/`, `copilot/`, `cursor/`, `devin/`), while merging their work still counts; and a commit title one account pushes to one project on 15 or more days of the last 30.
- People at work in followed repositories are checked for CKB projects of their own once a week, and anyone can suggest an organisation or a person on the page. Either joins when GitHub shows public CKB work (topics, names, or a CKB dependency) from the last 30 days. `BLOCKED` in `config.mjs` keeps an owner off.
- Once a day each followed repository's own event list fills the week, since an organisation's feed keeps only its last 300 events.

## History

The events API reaches back 90 days. Months and years come from GitHub's contributor statistics: commits per week and author for every known CKB repository, quiet ones included, refreshed weekly into `DATA_DIR/history.json`. From them: active developers per month (a commit in the month), new developers (their first commit among these repositories) and commits, two years back; and commits per month for each project.

Counted over the projects followed today: projects that stopped earlier are missing, so older months read low and the growth looks larger than it was.

## On chain

Once a day: every script the CKB explorer knows with a source repository (its repository is then followed too), and the mainnet contracts projects record in their committed ckb-cli migrations, measured on a public CKB node (`CKB_RPC`, default mainnet.ckb.dev): CKB in live cells that use each one and its last use. Shown in each project's card, with a tag in the scene.

## New projects and following

A followed public repository created in the last 14 days is a new project: it is listed under New and announced once to the open pages. "ckb" alone does not make a repository CKB work (it is also Central Kurdish and a Codebase Knowledge Base format): such a repository needs chain words in its name, description or topics.

Visitors follow projects and people on their device, without an account. With browser notices allowed, the server sends one when something followed moves (at most once per project in ten minutes) and, on request, when a new project appears. On iPhone that needs the page on the Home Screen.

## Share

A link to a period's highlights (`?h=day|week|month`), a project (`?repo=owner/name`) or a person (`?person=login`) opens the page on it, and its preview is a 1200 x 630 picture drawn by the server. Medals ignore bursts: per person, project and hour at most 10 updates count, and opening a branch never does.

## API

- `GET /api/state`: repositories, highlights, 7 days of history
- `GET /api/repo?name=owner/repo`: one repository, 30 days
- `GET /api/stream`: new events, Server-Sent Events
- `GET /og/highlights.png?p=`, `/og/repo.png?name=`, `/og/person.png?login=`, each with `lang=en|pt|zh`: share pictures
- `GET /api/push/key`, `POST /api/push` with `{sub, repos, people, news, lang}`, `POST /api/push/off` with `{endpoint}`: browser notices
- `GET /version.json`: the build the server runs, for the new-version notice
- `POST /api/propose` with `{"login"}`, then `GET /api/propose?id=`: a suggestion and how its check went

## License

MIT. Three.js is vendored in `public/vendor` under its own MIT licence.
