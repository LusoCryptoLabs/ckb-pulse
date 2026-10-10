// What a project put on chain, and how much it is used. Two sources, read once a day into DATA_DIR/onchain.json:
//  - the CKB explorer's list of known scripts, each with its source repository, transaction count and capacity in use;
//  - the deployment records projects commit (ckb-cli writes migrations/<network>/*.json with each contract's hashes),
//    whose mainnet contracts are measured on a public CKB node: capacity in live cells using them, and the last use.
import fs from 'node:fs'
import path from 'node:path'
import { gh } from './github.mjs'

const EXPLORER = 'https://mainnet-api.explorer.nervos.org/api/v2'
const RPC = process.env.CKB_RPC || 'https://mainnet.ckb.dev/'
const SHANNONS = 1e8
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let file = ''
let O = { at: 0, repos: {} } // full name -> [{ name, codeHash, hashType, source, txs, cells, capacity, lastUsedAt }]

export function loadOnchain(dir) {
  file = path.join(dir, 'onchain.json')
  if (fs.existsSync(file)) { try { O = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (err) { console.error('onchain unreadable:', err.message) } }
}
const save = () => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(O)); fs.renameSync(tmp, file) }
// a slow or failing answer from the explorer is skipped, never the end of the round
const explorer = async (p) => {
  try {
    const r = await fetch(EXPLORER + p, { headers: { accept: 'application/vnd.api+json', 'content-type': 'application/vnd.api+json' }, signal: AbortSignal.timeout(20000) })
    return r.ok ? await r.json() : null
  } catch { return null }
}
async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }), signal: AbortSignal.timeout(20000) })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  return j.result
}
const repoOf = (url) => { const m = String(url || '').match(/github\.com\/([^/]+\/[^/#?]+)/i); return m ? m[1].replace(/\.git$/, '') : null }

// capacity in live cells using a script (as lock or as type) and the time of its last transaction, from the node
async function usage(codeHash, hashType) {
  let capacity = 0, last = 0
  for (const scriptType of ['lock', 'type']) {
    const search = { script: { code_hash: codeHash, hash_type: hashType, args: '0x' }, script_type: scriptType, script_search_mode: 'prefix' }
    const c = await rpc('get_cells_capacity', [search]); capacity += parseInt(c?.capacity || '0x0', 16)
    const t = await rpc('get_transactions', [search, 'desc', '0x1'])
    const bn = t?.objects?.[0]?.block_number
    if (bn) { const h = await rpc('get_header_by_number', [bn]); last = Math.max(last, parseInt(h?.timestamp || '0x0', 16)) }
    await sleep(250)
  }
  return { capacity: Math.round(capacity / SHANNONS), lastUsedAt: last ? new Date(last).toISOString() : null }
}

// contracts a repository says it deployed on mainnet, from the ckb-cli migration files it committed
async function deployments(repos) {
  const found = new Map() // repo -> [{ name, codeHash, hashType }]
  for (const q of ['"cell_recipes" path:migrations', '"cell_recipes" "type_id"']) {
    for (let page = 1; page <= 3; page++) {
      const r = await gh(`/search/code?q=${encodeURIComponent(q)}&per_page=100&page=${page}`, { search: true })
      await sleep(6500)
      const items = r.body?.items || []
      for (const it of items) {
        const repo = it.repository?.full_name
        if (!repos.has(repo) || !/mainnet|\/main\//i.test(it.path)) continue // mainnet records only
        const f = await gh(`/repos/${repo}/contents/${it.path.split('/').map(encodeURIComponent).join('/')}`)
        let j = null
        try { j = JSON.parse(Buffer.from(f.body?.content || '', 'base64').toString()) } catch {}
        for (const c of j?.cell_recipes || []) {
          const codeHash = c.type_id || c.data_hash, hashType = c.type_id ? 'type' : 'data1'
          if (!/^0x[0-9a-f]{64}$/.test(codeHash || '')) continue
          const list = found.get(repo) || []
          if (!list.some((x) => x.codeHash === codeHash)) list.push({ name: c.name || 'contract', codeHash, hashType })
          found.set(repo, list)
        }
      }
      if (items.length < 100) break
    }
  }
  return found
}

export async function refreshOnchain(followed) {
  const repos = new Set(followed), out = {}
  // the explorer's known scripts first, every one of them: a registered script with a source repository is CKB work for
  // certain, so its repository is worth following even when nothing else found it. They come with transaction counts.
  const list = await explorer('/scripts?page=1&page_size=500')
  for (const s of list?.data || []) {
    const repo = repoOf(s.source_url)
    if (!repo || s.deprecated) continue
    const codeHash = s.type_hash || s.data_hash, hashType = s.type_hash ? 'type' : s.hash_type
    const info = await explorer(`/scripts/general_info?code_hash=${codeHash}&hash_type=${hashType}`)
    const g = info?.data?.[0] || {}
    const tx = await explorer(`/scripts/ckb_transactions?code_hash=${codeHash}&hash_type=${hashType}&page=1&page_size=1`)
    const ts = tx?.data?.ckb_transactions?.[0]?.block_timestamp
    ;(out[repo] ||= []).push({ name: s.name, codeHash, hashType, source: 'explorer', txs: g.count_of_transactions ?? null, cells: g.count_of_referring_cells ?? null, capacity: Math.round(Number(s.total_referring_cells_capacity || g.capacity_of_referring_cells || 0) / SHANNONS), lastUsedAt: ts ? new Date(Number(ts)).toISOString() : null })
    await sleep(300)
  }
  // then what projects record about their own mainnet deployments, measured on the node
  for (const [repo, list] of await deployments(repos)) {
    for (const c of list.slice(0, 12)) {
      if ((out[repo] || []).some((x) => x.codeHash === c.codeHash)) continue
      try { (out[repo] ||= []).push({ ...c, source: 'deployment', txs: null, cells: null, ...(await usage(c.codeHash, c.hashType)) }) } catch (err) { console.warn('usage', repo, c.name, err.message) }
    }
  }
  O = { at: Date.now(), repos: out }
  save()
  console.log(`onchain: ${Object.keys(out).length} repositories with contracts on mainnet`)
}
export const onchainOf = (full) => O.repos[full] || null
export const onchainAt = () => O.at
export const onchainRepos = () => Object.keys(O.repos)
