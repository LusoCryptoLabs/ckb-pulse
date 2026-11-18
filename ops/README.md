# Operations

The address of CKB Pulse is `pulse.lusocryptolabs.com`. The old one, `pulse-lab.lusocryptolabs.com`, holds no page: it
redirects. These files are what runs on the server, kept here so it can be rebuilt.

- `pulse-legacy.nginx.conf`: the old address. Installed as `/etc/nginx/sites-enabled/zz_pulse-lab_legacy_redirect.conf`.
  Check with `nginx -t` before `nginx -s reload`.
- `legacy-migrate.html`: the page the old address gives a browser, which carries the browser's settings to the new address
  (see `migrate.mjs`). Installed as `/var/www/pulse-legacy/migrate.html`. Rebuilt with `node ops/build-legacy.mjs`, which
  writes the file next to it.

The certificate of the old address is renewed by the same certbot job as before: the file keeps the
`/.well-known/acme-challenge/` location on port 80.
