// The digest opens with one plain sentence, in every language, and explains its own words.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { digestPage } from '../digest.mjs'

const base = 'https://pulse.example'
const period = (o = {}) => ({ stats: { updates: 221, people: 30, projects: 36 }, bars: [1, 2], repos: [['ckb-devrel/ccc', 30]], commits: [], pushes: [], people: [['alice', 20]], orgs: [], reviewers: [], merged: [], ...o })
const page = (lang, p = period(), extra = {}) => digestPage({ period: 'week', lang, leaders: { week: p, day: p, month: p }, news: [], trends: null, groupOf: () => 'builders', base, url: `${base}/digest`, ...extra })
const lede = (html) => html.match(/<p class="lede">([\s\S]*?)<\/p>/)[1]
const text = (html) => html.replace(/<[^>]+>/g, '')

test('the lede is a plain sentence with the numbers, the busiest project and person, in each language', () => {
  const want = { en: ['30 people worked on 36 projects in the CKB ecosystem and made 221 updates.', 'The busiest project was ccc.', 'The most active person was alice.'],
    pt: ['30 pessoas trabalharam em 36 projetos do ecossistema CKB e fizeram 221 atualizações.', 'O projeto mais ativo foi ccc.', 'A pessoa mais ativa foi alice.'],
    zh: ['30 人参与了 CKB 生态中的 36 个项目，共完成 221 次更新。', '最活跃的项目是 ccc。', '最活跃的人是 alice。'] }
  for (const [lang, parts] of Object.entries(want)) {
    const l = text(lede(page(lang)))
    for (const part of parts) assert.ok(l.includes(part), `${lang}: ${part}`)
  }
})

test('names in the sentence link to the live page, and are text, not markup', () => {
  const html = page('en', period({ repos: [['o/<b>x</b>', 5]], people: [['<i>y</i>', 3]] }))
  const l = lede(html)
  assert.ok(!l.includes('<b>x') && !l.includes('<i>y'))
  assert.ok(/<a href="https:\/\/pulse\.example\/\?repo=o%2F/.test(l))
})

test('one update, one person and one project read as singular', () => {
  const l = text(lede(page('en', period({ stats: { updates: 1, people: 1, projects: 1 } }))))
  assert.ok(l.includes('1 person worked on 1 project in the CKB ecosystem and made 1 update.'))
})

test('the sentence does not repeat the period: the title says it, a kept week included', () => {
  const fixed = { label: '2026-W46', at: Date.UTC(2026, 10, 16) }
  for (const html of [page('en'), page('en', period(), { fixed })]) assert.ok(!/last 7 days|that week/i.test(text(lede(html))))
})

test('an empty period says so instead of zeros', () => {
  const l = text(lede(page('en', period({ stats: { updates: 0, people: 0, projects: 0 }, repos: [], people: [] }))))
  assert.ok(l.includes('Nothing yet.') && !l.includes('0 people'))
})

test('the page explains update, commit, pull request and review, and links the full rules', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const html = page(lang), m = html.match(/<details class="words">([\s\S]*?)<\/details>/)
    assert.ok(m, lang)
    assert.equal((m[1].match(/<li>/g) || []).length, 4, lang)
    assert.ok(m[1].includes('/method?lang=' + lang), lang)
  }
})
