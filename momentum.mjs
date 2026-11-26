// What changed in a project this week against the week before, from facts that are hard to inflate: pull requests merged
// or reviewed by people, how many different people did it, and whether a release came out (once, however many tags). Pushes and commits are not counted, so fifty small commits from
// one person change nothing here. It is a list of facts, not a score and not a ranking.
const DAY = 864e5
const DOING = new Set(['pr_merged', 'review'])

function windowOf(events, from, to) {
  const byRepo = new Map()
  for (const e of events) {
    if (e.bot || e.agent || e.ai) continue
    const at = Date.parse(e.at)
    if (!(at >= from && at < to)) continue
    let r = byRepo.get(e.repo)
    if (!r) byRepo.set(e.repo, (r = { merged: 0, releases: 0, people: new Set() }))
    if (e.kind === 'pr_merged') r.merged++
    if (e.kind === 'release') r.releases++
    if (DOING.has(e.kind) && e.actor) r.people.add(e.actor.toLowerCase())
  }
  return byRepo
}

export function momentum(events, now = Date.now(), { week = 7 * DAY } = {}) {
  const cur = windowOf(events, now - week, now + 1), prev = windowOf(events, now - 2 * week, now - week)
  const zero = { merged: 0, releases: 0, people: new Set() }
  const rows = []
  for (const repo of new Set([...cur.keys(), ...prev.keys()])) {
    const c = cur.get(repo) || zero, p = prev.get(repo) || zero
    rows.push({ repo, merged: c.merged, mergedBefore: p.merged, people: c.people.size, peopleBefore: p.people.size, released: c.releases > 0 })
  }
  // picking up: more merged pull requests than the week before, and at least two different people at work
  const rising = rows.filter((r) => r.merged >= 2 && r.merged > r.mergedBefore && r.people >= 2).sort((a, b) => b.merged - b.mergedBefore - (a.merged - a.mergedBefore) || b.people - a.people)
  // gone quiet: a real week before (merged work from two people), nothing from people this week
  const quiet = rows.filter((r) => r.mergedBefore >= 2 && r.peopleBefore >= 2 && r.people === 0 && r.merged === 0).sort((a, b) => b.mergedBefore - a.mergedBefore)
  const released = rows.filter((r) => r.released).sort((a, b) => b.merged - a.merged)
  return { rising, quiet, released }
}
