// Writes ops/legacy-migrate.html, the page the old address gives a browser (see migrate.mjs).
import fs from 'node:fs'
import { legacyPage } from '../migrate.mjs'

const out = new URL('./legacy-migrate.html', import.meta.url)
fs.writeFileSync(out, legacyPage('https://pulse.lusocryptolabs.com'))
console.log(`wrote ${out.pathname}`)
