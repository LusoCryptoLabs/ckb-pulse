// Fiber: channel ids as Fiber writes them, openings and closings read from a block, and what changed in the graph.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { outpointKey, blockEvents, readGraph, NETS } from '../fiber.mjs'

const TX = (n) => '0x' + String(n).repeat(64).slice(0, 64)

test('a channel id is the funding transaction and its index, little endian', () => {
  // as the graph reports a real testnet channel: index 0 ends in 00000000
  assert.equal(outpointKey('0x574a73401ffa9d2612ed913a902ea2f692e7fe0e56aa5c650d4b944728143e4f', 0), '0x574a73401ffa9d2612ed913a902ea2f692e7fe0e56aa5c650d4b944728143e4f00000000')
  assert.equal(outpointKey(TX(1), 1), TX(1) + '01000000')
  assert.equal(outpointKey(TX(1), 258), TX(1) + '02010000')
})

test('a block opens a channel when it makes a FundingLock cell and closes one when it spends it', () => {
  const codes = NETS.testnet, plain = { code_hash: '0x' + '9'.repeat(64), hash_type: 'type', args: '0x' }
  const funding = { [outpointKey(TX(2), 0)]: 500, [outpointKey(TX(3), 0)]: 300 }
  const block = {
    header: { number: '0x64', timestamp: '0x19b0000000' },
    transactions: [
      // an opening: output 1 is the channel
      { hash: TX(4), inputs: [{ previous_output: { tx_hash: TX(9), index: '0x0' } }], outputs: [{ capacity: '0x174876e800', lock: plain }, { capacity: '0x2540be400', lock: { code_hash: codes.funding, hash_type: 'type', args: '0xab' } }] },
      // a cooperative close: the money goes back to plain locks
      { hash: TX(5), inputs: [{ previous_output: { tx_hash: TX(2), index: '0x0' } }], outputs: [{ capacity: '0x1', lock: plain }] },
      // a forced close: the commitment cell holds it for the delay
      { hash: TX(6), inputs: [{ previous_output: { tx_hash: TX(3), index: '0x0' } }], outputs: [{ capacity: '0x1', lock: { code_hash: codes.commitment, hash_type: 'type', args: '0x01' } }] },
      // the FundingLock code hash under the data hash type is not a channel
      { hash: TX(7), inputs: [], outputs: [{ capacity: '0x1', lock: { code_hash: codes.funding, hash_type: 'data1', args: '0x' } }] },
    ],
  }
  const ev = blockEvents(block, funding, codes)
  assert.deepEqual(ev.map((e) => [e.kind, e.id, e.ckb, !!e.forced]), [
    ['open', outpointKey(TX(4), 1), 100, false],
    ['close', outpointKey(TX(2), 0), 500, false],
    ['close', outpointKey(TX(3), 0), 300, true],
  ])
  assert.deepEqual(Object.keys(funding), [outpointKey(TX(4), 1)])
  assert.equal(ev[0].block, 100)
})

test('the first read of the graph says nothing; later reads say what changed', () => {
  const node = (k, name) => ({ pubkey: k, node_name: name, version: '0.9.1', timestamp: '0x1', udt_cfg_infos: [] })
  const chan = (id, a, b, t, on = true) => ({ channel_outpoint: id, node1: a, node2: b, capacity: '0x2540be400', created_timestamp: '0x1', update_info_of_node1: { timestamp: t, enabled: on, fee_rate: '0x3e8' }, update_info_of_node2: { timestamp: '0x1', enabled: true, fee_rate: '0x3e8' }, udt_type_script: null })
  const g1 = readGraph([node('A', 'a'), node('B', 'b')], [chan('c1', 'A', 'B', '0x5'), chan('c2', 'A', 'B', '0x5')], null, 1000)
  assert.deepEqual(g1.events, [])
  assert.equal(g1.channels.c1.cap, 100)
  const g2 = readGraph([node('A', 'a'), node('B', 'b'), node('C', 'c')], [chan('c1', 'A', 'B', '0x6'), chan('c2', 'A', 'B', '0x6', false), chan('c3', 'B', 'C', '0x1')], g1, 2000)
  assert.deepEqual(g2.events.map((e) => [e.kind, e.id]), [['node', 'C'], ['update', 'c1'], ['off', 'c2'], ['announce', 'c3']])
  const g3 = readGraph([node('A', 'a')], [chan('c3', 'B', 'C', '0x1')], g2, 3000)
  assert.deepEqual(g3.events.map((e) => [e.kind, e.id]), [['gone', 'c1'], ['gone', 'c2']])
  assert.equal(g3.channels.c3.seen, 2000)
})
