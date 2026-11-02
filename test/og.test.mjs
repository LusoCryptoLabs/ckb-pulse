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

test('/funded names the picture of the grant a link points to, or of them all; /use names its own', async () => {
  const { fundedPage } = await import('../funded.mjs')
  const { usePage } = await import('../use.mjs')
  const g = { topic: 9879, name: 'Pocket Node', grant: '$15,000', since: '2026-02-11', first: 0, status: 'progress', commits: 750, people: 8, updates: 19, bars: [1, 2], milestones: [], delivered: null, repos: [], lastWork: null, lastReport: null }
  const one = fundedPage({ lang: 'en', grants: [g], base: 'https://pulse.example', url: 'https://pulse.example/funded', readAt: null, g: '9879' })
  assert.match(image(one), /^https:\/\/pulse\.example\/og\/funded\.png\?topic=9879&(amp;)?lang=en&(amp;)?v=/)
  assert.match(one, /<title>Pocket Node · /)
  assert.match(one, /id="g-9879"/)
  const all = fundedPage({ lang: 'en', grants: [g], base: 'https://pulse.example', url: 'https://pulse.example/funded', readAt: null })
  assert.match(image(all), /og\/funded\.png\?lang=en/)
  assert.doesNotMatch(image(all), /topic=/)
  assert.match(usePage({ lang: 'en', base: 'https://pulse.example', url: 'https://pulse.example/use', img: 'https://pulse.example/og/use.png?v=1' }), /property="og:image" content="https:\/\/pulse\.example\/og\/use\.png\?v=1"/)
})

test('no share menu sits inside a paragraph, where a browser would close the paragraph before it', async () => {
  // 2026-11-02: <p class="share-top"><details> left the menu outside its holder, and the button could not be found
  const { fundedPage } = await import('../funded.mjs')
  const g = { topic: 1, name: 'A', grant: '$1', since: '2026-01-01', first: 0, status: 'progress', commits: 1, people: 1, updates: 1, bars: [1], milestones: [], delivered: null, repos: [], lastWork: null, lastReport: null }
  const pages = [fundedPage({ lang: 'en', grants: [g], base: 'https://p.example', url: 'https://p.example/funded', readAt: null }), page(120)]
  for (const html of pages) assert.doesNotMatch(html, /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<details/)
})
