// Link previews that follow what they show. X, Telegram and the rest fetch a preview once per address and keep it, so
// /?h=week shared on Friday could still show Monday's picture (2026-11-02). The picture's address carries a stamp of
// what it draws: when the numbers or the names change, the address changes with them and nobody is served an old one.
import crypto from 'node:crypto'

export const stampOf = (value) => crypto.createHash('sha1').update(JSON.stringify(value ?? null)).digest('base64url').slice(0, 10)
export const withStamp = (path, value) => `${path}${path.includes('?') ? '&' : '?'}v=${stampOf(value)}`
