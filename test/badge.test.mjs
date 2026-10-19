// Badges draw in every language, say the numbers, and grow with their words.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { badgeSvg, repoBadge, personBadge, allBadge } from '../badge.mjs'

const widthOf = (svg) => +svg.match(/width="(\d+)"/)[1]
for (const lang of ['en', 'pt', 'zh']) {
  test(`badges in ${lang}`, () => {
    const r = repoBadge({ updates: 41, people: 3 }, lang)
    assert.match(r, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/)
    assert.match(r, /41/); assert.match(r, /\b3\b/); assert.doesNotMatch(r, /\{\w+\}/)
    assert.match(repoBadge({ updates: 0, people: 0 }, lang), /#3b4330/) // grey when quiet
    assert.match(repoBadge(null, lang), /#3b4330/)
    assert.match(personBadge({ updates: 7, projects: [['a/b', 7]] }, lang), /\b7\b/)
    assert.match(allBadge({ updates: 598, people: 71, projects: 68 }, lang), /598/)
    assert.doesNotMatch(allBadge(null, lang), /\{\w+\}/)
  })
}
test('a longer value makes a wider badge', () => {
  assert.ok(widthOf(badgeSvg('CKB Pulse', 'a much longer line of words here')) > widthOf(badgeSvg('CKB Pulse', 'short')))
  assert.match(badgeSvg('a<b', 'c"d'), /a&lt;b/)
})
