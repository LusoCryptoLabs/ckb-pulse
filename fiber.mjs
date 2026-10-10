// Fiber, the payment network on CKB, seen two ways, on mainnet and testnet:
//  - the public graph (nodes, channels, their updates) from a listening Fiber node of your own, one per network
//    (FIBER_MAINNET_RPC, FIBER_TESTNET_RPC), read every 20 s. A node with no channels receives it by gossip, which is
//    slow and comes in waves: measured on testnet 2026-10-10, 317 channels in the first 2 minutes, 537 more when
//    their nodes announced them again 20 minutes later; outside that wave, updates 14 to 62 s after their own stamp;
//  - every channel opening and closing, public or private, from the chain, block by block: a channel is a cell under
//    Fiber's FundingLock, opened when the cell appears and closed when it is spent.
// Payments travel encrypted from node to node and are never visible. Kept in DATA_DIR/fiber.json.
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'

const DAY = 864e5
const KEEP = 7 * DAY
// FundingLock and CommitmentLock as in each network's fnn v0.9.1 release config (type scripts: upgrades keep them)
export const NETS = {
  mainnet: {
    rpc: process.env.FIBER_MAINNET_RPC, ckb: process.env.CKB_RPC || 'https://mainnet.ckb.dev/',
    funding: '0xe45b1f8f21bff23137035a3ab751d75b36a981deec3e7820194b9c042967f4f1', commitment: '0x2d45c4d3ed3e942f1945386ee82a5d1b7e4bb16d7fe1ab015421174ab747406c',
  },
  testnet: {
    rpc: process.env.FIBER_TESTNET_RPC, ckb: process.env.CKB_TESTNET_RPC || 'https://testnet.ckb.dev/',
    funding: '0x6c67887fe201ee0c7853f1682c0b77c0e6214044c156c7558269390a8afa6d7c', commitment: '0x740dee83f87c6f309824d8fd3fbdd3c8380ee6fc9acc90b1a748438afcdf81d8',
  },
}
export const fiberBus = new EventEmitter()
fiberBus.setMaxListeners(1000)

const hex = (x) => parseInt(x || '0x0', 16) || 0
const ckb = (shannons) => Math.round(shannons / 1e6) / 100
// an out point the way Fiber writes a channel's id: the transaction hash, then the index as 4 bytes, little endian
export function outpointKey(txHash, index) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(index)
  return txHash.toLowerCase() + b.toString('hex')
}

// what one block did to Fiber channels: outputs under the FundingLock open one, inputs spending a known funding cell
// close one (forced when the transaction makes a CommitmentLock cell). `funding` (id -> CKB) is updated in place.
export function blockEvents(block, funding, codes) {
  const out = [], number = hex(block.header.number), at = hex(block.header.timestamp)
  for (const tx of block.transactions) {
    const spent = tx.inputs.map((i) => outpointKey(i.previous_output.tx_hash, hex(i.previous_output.index))).filter((k) => k in funding)
    if (spent.length) {
      const forced = tx.outputs.some((o) => o.lock.code_hash === codes.commitment)
      for (const k of spent) { out.push({ kind: 'close', id: k, ckb: funding[k], forced, tx: tx.hash, block: number, at }); delete funding[k] }
    }
    tx.outputs.forEach((o, i) => {
      if (o.lock.code_hash !== codes.funding || o.lock.hash_type !== 'type') return
      const k = outpointKey(tx.hash, i)
      funding[k] = ckb(hex(o.capacity))
      out.push({ kind: 'open', id: k, ckb: funding[k], tx: tx.hash, block: number, at })
    })
  }
  return out
}

// the graph as stored: nodes by public key, channels by out point; and what changed since the last read
export function readGraph(rawNodes, rawChannels, prev, now) {
  const udt = {}
  for (const n of rawNodes) for (const u of n.udt_cfg_infos || []) udt[u.script.args] = u.name
  const nodes = {}, channels = {}, events = [], first = !prev
  for (const n of rawNodes) {
    const old = prev?.nodes[n.pubkey]
    nodes[n.pubkey] = { name: n.node_name || '', v: n.version || '', ts: hex(n.timestamp), seen: old?.seen || now }
    if (!old && !first) events.push({ kind: 'node', id: n.pubkey, name: nodes[n.pubkey].name, at: now })
  }
  for (const c of rawChannels) {
    const u1 = c.update_info_of_node1 || {}, u2 = c.update_info_of_node2 || {}, us = c.udt_type_script
    const ch = {
      a: c.node1, b: c.node2, cap: us ? hex(c.capacity) : ckb(hex(c.capacity)), asset: us ? udt[us.args] || 'token' : 'CKB',
      created: hex(c.created_timestamp), updated: Math.max(hex(u1.timestamp), hex(u2.timestamp)),
      on: u1.enabled !== false && u2.enabled !== false, fee: Math.max(hex(u1.fee_rate), hex(u2.fee_rate)),
    }
    const old = prev?.channels[c.channel_outpoint]
    ch.seen = old?.seen || now
    channels[c.channel_outpoint] = ch
    if (first) continue
    if (!old) events.push({ kind: 'announce', id: c.channel_outpoint, a: ch.a, b: ch.b, cap: ch.cap, asset: ch.asset, created: ch.created, updated: ch.updated, at: now })
    else if (ch.on !== old.on) events.push({ kind: ch.on ? 'on' : 'off', id: c.channel_outpoint, a: ch.a, b: ch.b, at: now })
    else if (ch.updated > old.updated) events.push({ kind: 'update', id: c.channel_outpoint, at: now })
  }
  if (!first) for (const [k, c] of Object.entries(prev.channels)) if (!channels[k]) events.push({ kind: 'gone', id: k, a: c.a, b: c.b, at: now })
  return { nodes, channels, events }
}

// ---------- the loop ----------
let file = ''
const S = {}
for (const net of Object.keys(NETS)) S[net] = { graph: null, graphAt: 0, funding: null, block: 0, events: [] }
let dirty = false

async function rpc(url, method, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }), signal: AbortSignal.timeout(20000) })
  const j = await r.json()
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`)
  return j.result
}
async function whole(url, method, key) {
  const out = []
  let after = null
  for (;;) {
    const r = await rpc(url, method, [after ? { limit: '0x1f4', after } : { limit: '0x1f4' }])
    out.push(...r[key])
    if (r[key].length < 500) return out
    after = r.last_cursor
  }
}
function emit(net, e) {
  e.net = net
  // updates only make a line flash on open pages; the rest is kept for a week
  if (e.kind !== 'update') { const s = S[net]; s.events.push(e); const cut = Date.now() - KEEP; while (s.events.length && s.events[0].at < cut) s.events.shift() }
  fiberBus.emit('event', e)
  dirty = true
}

async function pollGraph(net) {
  const n = NETS[net], s = S[net]
  const [ns, cs] = await Promise.all([whole(n.rpc, 'graph_nodes', 'nodes'), whole(n.rpc, 'graph_channels', 'channels')])
  const g = readGraph(ns, cs, s.graph, Date.now())
  s.graph = { nodes: g.nodes, channels: g.channels }
  s.graphAt = Date.now()
  for (const e of g.events) emit(net, e)
  dirty = true
}
// every open channel on chain, read once at start (and after a long gap), then kept up to date block by block
async function loadFunding(net) {
  const n = NETS[net], funding = {}
  const search = { script: { code_hash: n.funding, hash_type: 'type', args: '0x' }, script_type: 'lock', script_search_mode: 'prefix' }
  let after = null
  do {
    const r = await rpc(n.ckb, 'get_cells', [search, 'asc', '0x3e8', after])
    for (const c of r.objects) funding[outpointKey(c.out_point.tx_hash, hex(c.out_point.index))] = ckb(hex(c.output.capacity))
    after = r.objects.length === 1000 ? r.last_cursor : null
  } while (after)
  return funding
}
async function scanChain(net) {
  const n = NETS[net], s = S[net]
  const tip = hex(await rpc(n.ckb, 'get_tip_block_number', []))
  if (!s.funding || !s.block || tip - s.block > 3000) {
    s.funding = await loadFunding(net)
    s.block = tip
    dirty = true
    console.log(`fiber ${net}: ${Object.keys(s.funding).length} channels open on chain at block ${tip}`)
    return
  }
  // at most 30 blocks a round (about 4 minutes of chain), so a restart catches up without a burst
  for (let b = s.block + 1; b <= Math.min(tip, s.block + 30); b++) {
    const block = await rpc(n.ckb, 'get_block_by_number', ['0x' + b.toString(16)])
    if (!block) break
    for (const e of blockEvents(block, s.funding, n)) emit(net, e)
    s.block = b
  }
}

function load() {
  if (!fs.existsSync(file)) return
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const net of Object.keys(NETS)) if (j[net]) Object.assign(S[net], j[net])
  } catch (err) { console.error('fiber state unreadable:', err.message) }
}
function save() {
  if (!dirty || !file) return
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(S))
  fs.renameSync(tmp, file)
  dirty = false
}
function every(ms, f) {
  const run = async () => { try { await f() } catch (err) { console.warn('fiber', err.message) } setTimeout(run, ms).unref() }
  run()
}
export function startFiber(dir) {
  file = path.join(dir, 'fiber.json')
  load()
  for (const net of Object.keys(NETS)) {
    if (NETS[net].rpc) every(20e3, () => pollGraph(net))
    every(8e3, () => scanChain(net))
  }
  setInterval(save, 30e3).unref()
}

// what the page needs for one network
export function fiberState(net) {
  const s = S[net]
  if (!s) return null
  const funding = Object.values(s.funding || {})
  return {
    net, configured: !!NETS[net].rpc, at: Date.now(), graphAt: s.graphAt, block: s.block,
    nodes: Object.entries(s.graph?.nodes || {}).map(([id, n]) => ({ id, ...n })),
    channels: Object.entries(s.graph?.channels || {}).map(([id, c]) => ({ id, ...c })),
    chain: { open: funding.length, ckb: Math.round(funding.reduce((a, b) => a + b, 0)) },
    events: s.events.slice(-200),
  }
}
export const fiberHealth = () => Object.fromEntries(Object.keys(NETS).map((net) => [net, { graphAt: S[net].graphAt ? new Date(S[net].graphAt).toISOString() : null, block: S[net].block }]))
