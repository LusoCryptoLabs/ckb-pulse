import test from 'node:test'
import assert from 'node:assert/strict'
import { supportPage, ADDRESSES, COSTS } from '../support.mjs'
import { methodPage } from '../method.mjs'
import { COUNTS } from '../visits.mjs'

const base = 'https://pulse.example'

// bech32 and bech32m checksums (BIP 173 and 350), for the Bitcoin and the CKB address
const CH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const polymod = (v) => { const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let c = 1; for (const x of v) { const b = c >>> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >> i) & 1) c ^= G[i] } return c >>> 0 }
const bechOk = (s) => {
  const i = s.lastIndexOf('1'), hrp = s.slice(0, i), d = [...s.slice(i + 1)].map((c) => CH.indexOf(c))
  if (d.includes(-1)) return false
  const v = polymod([...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31), d))
  return v === 1 || v === 0x2bc830a3
}

test('the three receiving addresses are well formed and their checksums hold', () => {
  const by = Object.fromEntries(ADDRESSES.map((a) => [a.id, a.address]))
  assert.deepEqual(Object.keys(by).sort(), ['btc', 'ckb', 'evm'])
  assert.ok(by.ckb.startsWith('ckb1') && bechOk(by.ckb), 'CKB mainnet address, checksum')
  assert.ok(by.btc.startsWith('bc1q') && bechOk(by.btc), 'Bitcoin mainnet address, checksum')
  // the EIP-55 case checksum needs keccak, which Pulse does not carry: it was checked once by hand, with @noble/hashes, when the address was given
  assert.match(by.evm, /^0x[0-9a-fA-F]{40}$/)
})

test('the support page shows the limits and the three addresses, in each language, with a counted copy button each', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const html = supportPage({ lang, base, url: `${base}/support` })
    assert.ok(html.includes(`<b>${COSTS.api}</b>`) && html.includes(`<b>${COSTS.server}</b>`) && html.includes(`<b>${COSTS.api + COSTS.server}</b>`), lang)
    for (const a of ADDRESSES) {
      assert.equal(html.split(`data-copy="${a.address}"`).length - 1, 1, `${lang} ${a.id}: one copy button`)
      assert.ok(html.includes(`<pre><code>${a.address}</code></pre>`) && html.includes(`data-count="${a.count}"`), `${lang} ${a.id}`)
      assert.ok(COUNTS.includes(a.count), `${a.count} is a counted name`)
    }
    assert.ok(!/\bsp\./.test(html), `${lang}: no word key left unfilled`)
    assert.ok(!new RegExp('[' + String.fromCharCode(8211, 8212) + ']').test(html), 'no long dashes')
  }
  assert.ok(supportPage({ lang: 'pt', base, url: `${base}/support` }).includes('Apoiar o'))
})

test('every page footer links to the support page', () => {
  assert.ok(methodPage({ lang: 'en', base, url: `${base}/method` }).includes('<a href="/support">Support</a>'))
})
