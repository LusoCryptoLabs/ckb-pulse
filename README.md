# CKB Pulse

Live GitHub activity of the CKB ecosystem, drawn in 3D.

Each project is a block that lights up when people work on it. Live, last 24 hours or last 7 days. English, 中文, Português.

https://pulse-lab.lusocryptolabs.com

## Run

```sh
GITHUB_TOKEN=<read-only token> node server.mjs
```

Node 20 or later, no dependencies. `PORT` defaults to 8080, `DATA_DIR` to `./data`.

## What it follows

- The organisations in `config.mjs`, polled every minute with ETags.
- Builders: public repositories that depend on CKB libraries or carry CKB topics, found by search every 6 hours.
- Only public repositories. Owners with no human activity in 30 days are hidden. Bots do not count as activity.

## API

- `GET /api/state`: repositories, highlights, 7 days of history
- `GET /api/repo?name=owner/repo`: one repository, 30 days
- `GET /api/stream`: new events, Server-Sent Events

## License

MIT. Three.js is vendored in `public/vendor` under its own MIT licence.
