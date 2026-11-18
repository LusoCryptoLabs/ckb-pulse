// /lessons: every topic and lesson shows with links to its commits, text written by a model is escaped, people on the
// leave list take their sources with them, and the page is not in the menu while it is reviewed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { lessonsPage, shownLessons } from '../lessons.mjs'
import { LESSONS } from '../lessons-data.mjs'
import { OPT_OUT } from '../config.mjs'

const page = (data, lang = 'en') => lessonsPage({ lang, base: 'https://pulse.example', url: 'https://pulse.example/lessons', data })

test('every topic and every lesson of the week is on the page, each linked to its commits', () => {
  const html = page(LESSONS)
  const lessons = LESSONS.topics.reduce((n, t) => n + t.lessons.length, 0)
  assert.ok(lessons > 0)
  assert.equal((html.match(/<article class="ln/g) || []).length, lessons)
  for (const t of LESSONS.topics) assert.ok(html.includes(`>${t.area.replace(/&/g, '&amp;')}<`), t.area)
  const first = LESSONS.topics[0].lessons[0].sources[0]
  assert.ok(html.includes(`https://github.com/${first.repo}/commit/${first.hash}`))
  assert.ok(html.includes('<meta name="robots" content="noindex">'))
})

test('the page speaks each language and shows no word key', () => {
  for (const [lang, word] of [['en', 'What CKB'], ['pt', 'O que a CKB'], ['zh', 'CKB 本周']]) {
    const html = page(LESSONS, lang)
    assert.ok(html.includes(word), lang)
    assert.ok(!/\bls\.[a-z]+\b/.test(html), `${lang}: a missing word shows its key`)
  }
})

test('text written by a model is escaped', () => {
  const evil = { from: '2026-11-11', to: '2026-11-18', read: 1, topics: [{ area: 'Other', summary: '<b>x</b>', lessons: [{ title: '<img src=x onerror=alert(1)>', lesson: '"><script>alert(1)</script>', concepts: ['Other'], status: 'current', note: '', sources: [{ repo: 'a/b', hash: 'abc', subject: '<i>s</i>' }] }] }] }
  const html = page(evil)
  assert.ok(!html.includes('<img src=x') && !html.includes('<script>alert') && !html.includes('<i>s</i>'))
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
})

test('a person on the leave list takes their sources with them, and a lesson with none left goes', () => {
  const data = { from: '2026-11-11', to: '2026-11-18', read: 2, topics: [{ area: 'Other', summary: '', lessons: [
    { title: 'kept', lesson: 'x', concepts: [], status: 'current', note: '', sources: [{ repo: 'leaver/r', hash: '1', subject: 's' }, { repo: 'stays/r', hash: '2', subject: 's' }] },
    { title: 'only theirs', lesson: 'y', concepts: [], status: 'current', note: '', sources: [{ repo: 'Leaver/r2', hash: '3', subject: 's' }] },
  ] }] }
  // the control: before they ask, both lessons and all three sources are there
  assert.equal(shownLessons(data)[0].lessons.length, 2)
  OPT_OUT.add('leaver')
  try {
    const shown = shownLessons(data)
    assert.deepEqual(shown[0].lessons.map((l) => l.title), ['kept'])
    assert.deepEqual(shown[0].lessons[0].sources.map((s) => s.repo), ['stays/r'])
    assert.ok(!page(data).includes('leaver/'))
  } finally { OPT_OUT.delete('leaver') }
})

test('the page is not in the menu while it is reviewed', () => {
  const menu = fs.readFileSync(new URL('../public/menu.js', import.meta.url), 'utf8')
  assert.ok(!menu.includes('/lessons'))
})
