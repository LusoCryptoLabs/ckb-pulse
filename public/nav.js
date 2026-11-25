// The address of an open card, so the address bar can be copied and a reload comes back to it: ?repo=owner/name or
// ?person=login on the page it was opened on, and nothing of the other one. Closing takes it out again.
export const CARD_KEYS = ['repo', 'person']
export function cardUrl(href, kind = '', value = '') {
  const u = new URL(href, 'https://pulse.invalid')
  for (const k of CARD_KEYS) u.searchParams.delete(k)
  if (CARD_KEYS.includes(kind) && value) u.searchParams.set(kind, String(value))
  return u.pathname + u.search + u.hash
}
// does a downward pull that began near the top of a scrolled-to-top card close it
export const pullCloses = ({ startY, y, top, scrollTop }, edge = 56, distance = 70) => scrollTop === 0 && startY - top < edge && y - startY > distance
