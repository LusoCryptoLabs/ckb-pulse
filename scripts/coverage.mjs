// How much CKB work on GitHub does Pulse follow? Searches GitHub by signals discovery does not use, drops what Pulse
// already follows, keeps what was pushed in the last 30 days and looks like CKB, and prints the count and the list.
// A number to read each month (the coverage workflow), not a gate: on 2026-11-19 it found about 60 against 307.
//   GITHUB_TOKEN=... node scripts/coverage.mjs [https://pulse.lusocryptolabs.com]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-'))
const { textIsCkb } = await import('../pulse.mjs')
const { README_CKB, CKB_NOT } = await import('../config.mjs')
const BASE = process.argv[2] || 'https://pulse.lusocryptolabs.com'
const TOKEN = process.env.GITHUB_TOKEN
if (!TOKEN || TOKEN === 'offline') { console.error('GITHUB_TOKEN is needed: code search does not answer without one'); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const gh = async (p) => { const r = await fetch('https://api.github.com' + p, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'ckb-pulse-coverage' } }); return r.ok ? r.json() : {} }
const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)

// signals outside config.mjs: words in a README, endpoints and tools in any file
const REPO = [`ckb blockchain in:readme pushed:>${since}`, `nervos in:readme pushed:>${since}`, `"fiber network" ckb in:readme pushed:>${since}`, `spore ckb in:readme pushed:>${since}`]
const CODE = ['"testnet.ckb.dev"', '"mainnet.ckb.dev"', '"ckb-script-templates"', '"ckb-js-vm"', '"ckb_std" language:Rust', '"ckb-debugger" filename:Makefile', '"@ckb-ccc/udt" filename:package.json', '"ckb-vm" filename:Cargo.toml']

const have = new Set((await (await fetch(`${BASE}/api/state`)).json()).repos.map((r) => r.name.toLowerCase()))
const found = new Map()
for (const q of REPO) {
  for (let page = 1; page <= 3; page++) {
    const items = (await gh(`/search/repositories?per_page=100&page=${page}&q=${encodeURIComponent(q)}`)).items || []
    for (const it of items) if (!it.fork && !it.archived && it.private === false) found.set(it.full_name, it)
    await sleep(2200)
    if (items.length < 100) break
  }
}
for (const q of CODE) {
  const items = (await gh(`/search/code?per_page=100&q=${encodeURIComponent(q)}`)).items || []
  for (const it of items) if (it.repository && !it.repository.fork && !found.has(it.repository.full_name)) found.set(it.repository.full_name, null)
  await sleep(6500)
}
const missing = []
let readmes = 0
for (const [full, hit] of found) {
  if (have.has(full.toLowerCase())) continue
  const m = hit || await gh(`/repos/${full}`)
  if (!m.full_name || m.private !== false || m.fork || m.archived || !(m.pushed_at > since)) continue
  let ok = textIsCkb(m)
  if (ok !== true && readmes < 150) { // the text does not settle it: the README does (also for a code hit with a plain name)
    readmes++
    const rd = await gh(`/repos/${full}/readme`)
    const text = Buffer.from(rd.content || '', 'base64').toString('utf8').slice(0, 6000)
    ok = ok !== false && README_CKB.test(text) && !CKB_NOT.test(text)
  }
  if (ok) missing.push({ full, pushed: m.pushed_at.slice(0, 10), desc: (m.description || '').slice(0, 80) })
}
missing.sort((a, b) => b.pushed.localeCompare(a.pushed))
const share = Math.round((have.size / (have.size + missing.length)) * 100)
const lines = [`## CKB Pulse coverage, ${new Date().toISOString().slice(0, 10)}`, '',
  `Pulse follows ${have.size} repositories. This check found ${missing.length} more that were pushed since ${since} and look like CKB work: about ${share}% covered, by these signals.`,
  'It reads names, descriptions and READMEs, not the code: some of these are not CKB, and CKB work that never says so is not here.', '',
  ...missing.map((m) => `- ${m.full} (${m.pushed})${m.desc ? ': ' + m.desc : ''}`)]
console.log(lines.join('\n'))
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
process.exit(0)
