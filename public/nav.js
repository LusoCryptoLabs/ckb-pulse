// The address of an open card, so the address bar can be copied and a reload comes back to it: ?repo=owner/name or
// ?person=login on the page it was opened on, and nothing of the other one. Closing takes it out again.
export const CARD_KEYS = ['repo', 'person']
export function cardUrl(href, kind = '', value = '') {
  const u = new URL(href, 'https://pulse.invalid')
  for (const k of CARD_KEYS) u.searchParams.delete(k)
  if (CARD_KEYS.includes(kind) && value) u.searchParams.set(kind, String(value))
  return u.pathname + u.search + u.hash
}
// What a pull that begins on the top edge of a card that is not scrolled does. On a phone the card is a sheet that opens
// at half height: pulled up it opens fully, pulled down from full it goes back to half, pulled down from half it closes.
// Where there is no sheet (a tablet, a short screen) a pull down closes it.
export function pullAction({ startY, y, top, scrollTop, tall = false, sheet = true }, edge = 56, distance = 70) {
  if (scrollTop !== 0 || startY - top >= edge) return null
  const dy = y - startY
  if (dy > distance) return sheet && tall ? 'collapse' : 'close'
  if (sheet && !tall && dy < -50) return 'expand'
  return null
}
// a tap on the handle (the top 28 px of the card, not a control) opens a half sheet fully, and closes a full one to half
export const handleTap = ({ startY, y, top, target }, zone = 28, slop = 10) => startY - top < zone && Math.abs(y - startY) < slop && !target?.closest?.('button, a, summary, input, select')
