// A preview's picture is named after what it draws, so a link shared later never shows an older picture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stampOf, withStamp } from '../og.mjs'
import { digestPage } from '../digest.mjs'

test('the stamp follows the content', () => {
  assert.equal(stampOf({ updates: 120 }), stampOf({ updates: 120 }))
  assert.notEqual(stampOf({ updates: 120 }), stampOf({ updates: 121 }))
  assert.match(withStamp('/og/repo.png?name=a%2Fb', 1), /^\/og\/repo\.png\?name=a%2Fb&v=[\w-]{10}$/)
  assert.match(withStamp('/og/x.png', 1), /^\/og\/x\.png\?v=/)
})

const period = (updates) => ({ stats: { updates, people: 14, projects: 9 }, bars: [1, 2, 3], repos: [['ckb-devrel/ccc', 30]], commits: [['ckb-devrel/ccc', 3]], pushes: [], people: [['alice', 20]], orgs: [['ckb-devrel', 40]] })
const page = (updates) => digestPage({ period: 'week', lang: 'en', leaders: { day: period(1), week: period(updates), month: period(1) }, news: [], trends: { months: [] }, groupOf: () => 'builders', base: 'https://pulse.example', url: 'https://pulse.example/digest' })
const image = (html) => html.match(/property="og:image" content="([^"]*)"/)[1]

test("the digest's picture changes address when the week's numbers change", () => {
  assert.match(image(page(120)), /og\/highlights\.png\?p=week&amp;lang=en&amp;v=|og\/highlights\.png\?p=week&lang=en&v=/)
  assert.notEqual(image(page(120)), image(page(121)))
  assert.equal(image(page(120)), image(page(120)))
})

test('/use names its own picture', async () => {
  const { usePage } = await import('../use.mjs')
  assert.match(usePage({ lang: 'en', base: 'https://pulse.example', url: 'https://pulse.example/use', img: 'https://pulse.example/og/use.png?v=1' }), /property="og:image" content="https:\/\/pulse\.example\/og\/use\.png\?v=1"/)
})

test('no share menu sits inside a paragraph, where a browser would close the paragraph before it', async () => {
  // 2026-11-02: <p class="share-top"><details> left the menu outside its holder, and the button could not be found
  const pages = [page(120)]
  for (const html of pages) assert.doesNotMatch(html, /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<details/)
})
