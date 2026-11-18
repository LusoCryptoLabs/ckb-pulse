// Sharing is one list of targets and one place on the page: every public page has the button next to its menu, in each
// language, with the page's own address and the day in the link; a private page has none.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shareTargets, shareHtml, barHtml } from '../public/menu.js'
import { words } from '../cards.mjs'
import { digestPage } from '../digest.mjs'
import { usePage } from '../use.mjs'
import { methodPage } from '../method.mjs'
import { privacyPage } from '../privacy.mjs'
import { lessonsPage } from '../lessons.mjs'

const base = 'https://pulse.example'
const period = { stats: { updates: 120, people: 14, projects: 9 }, bars: [1, 2], repos: [['a/b', 3]], commits: [], pushes: [], people: [['alice', 2]], orgs: [], reviewers: [], merged: [] }
const lessons = { from: '2026-11-11', to: '2026-11-18', read: 1, topics: [{ area: 'T', summary: 's', lessons: [{ title: 'x', lesson: 'y', concepts: [], status: 'current', note: '', sources: [{ repo: 'o/r', hash: 'abc', subject: 's' }] }] }] }

test('the targets: copy, X, Telegram, WhatsApp, in that order, with the picture only when there is one', () => {
  const t = words('en'), args = { url: 'https://p.example/x?lang=en&d=2026-11-18', title: 'A title' }
  assert.deepEqual(shareTargets(t, args).map((x) => x.key), ['copy', 'x', 'telegram', 'whatsapp'])
  assert.deepEqual(shareTargets(t, { ...args, image: 'https://p.example/i.png', native: true }).map((x) => x.key), ['native', 'copy', 'x', 'telegram', 'whatsapp', 'image'])
  const x = shareTargets(t, args).find((y) => y.key === 'x').href
  assert.ok(x.includes(encodeURIComponent(args.url)) && x.includes(encodeURIComponent('A title')))
})

test('the button has a name even when only its icon shows, and the plain page does not offer the native sheet', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const t = words(lang), html = shareHtml(t, { url: `${base}/x`, title: 'T', image: `${base}/i.png` })
    assert.ok(html.includes(`aria-label="${t('sh.share')}"`), lang)
    assert.ok(!html.includes('share_native'), lang)
    assert.ok(html.includes('data-copy="https://pulse.example/x"'), lang)
  }
})

test('every public page has the button in its bar, before the menu, with its own address and the day', () => {
  const pages = {
    digest: (lang) => digestPage({ period: 'week', lang, leaders: { week: period, day: period, month: period }, news: [], trends: null, groupOf: () => 'builders', base, url: `${base}/digest` }),
    use: (lang) => usePage({ lang, base, url: `${base}/use` }),
    method: (lang) => methodPage({ lang, base, url: `${base}/method` }),
    privacy: (lang) => privacyPage({ lang, base, url: `${base}/privacy` }),
  }
  for (const [name, make] of Object.entries(pages)) for (const lang of ['en', 'pt', 'zh']) {
    const html = make(lang), bar = html.slice(html.indexOf('class="pm-bar"'), html.indexOf('</header>'))
    assert.equal((html.match(/class="pshare"/g) || []).length, 1, `${name} ${lang}: one button`)
    assert.ok(bar.indexOf('class="pshare"') > 0 && bar.indexOf('class="pshare"') < bar.indexOf('class="pmenu"'), `${name} ${lang}: next to the menu`)
    const copy = html.match(/data-copy="([^"]+)"/)[1].replaceAll('&amp;', '&')
    assert.match(copy, new RegExp(`lang=${lang}`), `${name} ${lang}: the language travels in the link`)
    assert.match(copy, /[?&]d=\d{4}-\d{2}-\d{2}/, `${name} ${lang}: the day travels in the link`)
    assert.ok(copy.startsWith(`${base}/${name}`), `${name} ${lang}: its own address`)
  }
})

test('the private lessons page has no share button', () => {
  const html = lessonsPage({ lang: 'en', base, url: `${base}/lessons`, data: lessons })
  assert.ok(!html.includes('pshare') && !html.includes('share_'))
  assert.ok(html.includes('<meta name="robots" content="noindex">'))
})

test('a bar without a share option has no button', () => {
  assert.ok(!barHtml(words('en'), { base, lang: 'en' }).includes('pshare'))
})
