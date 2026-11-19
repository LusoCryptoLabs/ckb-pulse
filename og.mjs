// Link previews that follow what they show. X, Telegram and the rest fetch a preview once per address and keep it, so
// /?h=week shared on Friday could still show Monday's picture (2026-11-02). The picture's address carries a stamp of
// what it draws: when the numbers or the names change, the address changes with them and nobody is served an old one.
import crypto from 'node:crypto'

// LOOK goes into every stamp: when the cards are redrawn in a new design the addresses change too, so no site keeps showing
// the old picture (2: the LusoCryptoLabs look, 2026-11-19; the forum still showed the lime cards for unchanged numbers)
export const LOOK = 2
export const stampOf = (value) => crypto.createHash('sha1').update(JSON.stringify([LOOK, value ?? null])).digest('base64url').slice(0, 10)
export const withStamp = (path, value) => `${path}${path.includes('?') ? '&' : '?'}v=${stampOf(value)}`
