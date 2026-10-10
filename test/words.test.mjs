// Every language says everything English says, with the same placeholders; no long dashes anywhere in the repository.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { WORDS } from '../public/words.js'

const SAME_IN_ALL = new Set(['tag.ckb', 'tag.nervos']) // names, the English text is used
const holes = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

for (const lang of Object.keys(WORDS).filter((l) => l !== 'en')) {
  test(`${lang} has every word`, () => {
    const missing = Object.keys(WORDS.en).filter((k) => !(k in WORDS[lang]) && !SAME_IN_ALL.has(k))
    assert.deepEqual(missing, [])
  })
  test(`${lang} keeps the placeholders`, () => {
    const wrong = Object.keys(WORDS[lang]).filter((k) => k in WORDS.en && holes(WORDS[lang][k]) !== holes(WORDS.en[k]))
    assert.deepEqual(wrong, [])
  })
}

test('no long or medium dashes in tracked text', () => {
  const root = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
  const files = execSync('git ls-files', { cwd: root }).toString().split('\n').filter((f) => /\.(mjs|js|json|html|css|md|webmanifest|yml)$/.test(f) && !f.startsWith('public/vendor/') && f !== 'package-lock.json')
  const found = files.filter((f) => /[\u2013\u2014]/.test(fs.readFileSync(path.join(root, f), 'utf8')))
  assert.deepEqual(found, [])
})
