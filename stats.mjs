// Who reads Pulse, for us: people per day for the last 30 days, behind the lessons key (/lessons/visits). A person is a
// browser whose page said it opened (visits.mjs); days before 2026-11-27 have no such number and show empty. Browsers
// and bots are much larger and of another kind, so they go in the table, not on the chart's axis.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + (Number(b) || 0), 0)
const fmt = (n) => (n === null || n === undefined ? '' : Number(n).toLocaleString('pt-PT'))

/** The page, from visits(30). */
export function statsPage({ base, v }) {
  const days = v.days.map((d) => ({ day: d.day, people: d.people, browsers: d.browsers, bots: sum(d.bots), views: sum(d.views) }))
  const known = days.filter((d) => d.people !== null && d.people !== undefined)
  const today = days.at(-1), full = known.slice(0, -1).slice(-7)
  const avg = full.length ? Math.round(full.reduce((a, d) => a + d.people, 0) / full.length) : null
  const max = Math.max(1, ...known.map((d) => d.people))
  // the chart: one bar per day, 4px round top on the baseline, a 2px gap between bars
  const W = 600, H = 200, pad = 44, bw = (W - pad) / days.length
  const nice = Math.max(10, Math.ceil(max / 10) * 10)
  const y = (n) => H - (n / nice) * (H - 24)
  const bars = days.map((d, i) => {
    const x = pad + i * bw + 1, w = Math.max(2, bw - 2)
    const tip = `${d.day}: ${d.people === null || d.people === undefined ? 'sem contagem' : `${d.people} pessoas`}`
    if (d.people === null || d.people === undefined) return `<g><title>${esc(tip)}</title><rect x="${x}" y="0" width="${w}" height="${H}" fill="transparent"/><rect x="${x}" y="${H - 1}" width="${w}" height="1" class="none"/></g>`
    const top = y(d.people), h = Math.max(1, H - top), r = Math.min(4, w / 2, h)
    return `<g><title>${esc(tip)}</title><rect x="${x}" y="0" width="${w}" height="${H}" fill="transparent"/><path class="bar" d="M${x},${H}V${top + r}q0,-${r} ${r},-${r}h${w - 2 * r}q${r},0 ${r},${r}V${H}Z"/></g>`
  }).join('')
  const grid = [0, nice / 2, nice].map((n) => `<line x1="${pad}" x2="${W}" y1="${y(n)}" y2="${y(n)}" class="grid"/><text x="${pad - 6}" y="${y(n) + 7}" text-anchor="end" class="ax">${n}</text>`).join('')
  const dm = (d) => `${d.slice(8)}/${d.slice(5, 7)}`
  const ticks = [[0, 'start', pad], [days.length - 1, 'end', W]].map(([i, a, x]) => `<text x="${x}" y="${H + 26}" text-anchor="${a}" class="ax">${dm(days[i].day)}</text>`).join('')
  const rows = days.slice().reverse().map((d) => `<tr><td>${dm(d.day)}</td><td>${d.people === null || d.people === undefined ? '<span class="mut">sem contagem</span>' : fmt(d.people)}</td><td>${fmt(d.browsers)}</td><td>${fmt(d.bots)}</td></tr>`).join('')
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Visitas · CKB Pulse</title>
<link rel="icon" type="image/svg+xml" href="${esc(base)}/icon.svg?v=lcl1"><link rel="stylesheet" href="${esc(base)}/theme.css">
<style>
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0}
main{max-width:720px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:1.5rem;margin:0 0 4px}.mut{color:var(--mut)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0}
.tile{background:var(--surface);border:1px solid var(--edge);border-radius:10px;padding:12px 14px}
.tile b{display:block;font-size:1.8rem;line-height:1.2}.tile span{color:var(--mut);font-size:.85rem}
.chart{background:var(--surface);border:1px solid var(--edge);border-radius:10px;padding:14px}
svg{width:100%;height:auto;display:block}.bar{fill:var(--lime)}g:hover .bar{opacity:.75}.none{fill:var(--edge)}
.grid{stroke:var(--edge-soft);stroke-width:1}.ax{fill:var(--mut);font-size:16px}
table{width:100%;border-collapse:collapse;margin-top:20px;font-size:.9rem;font-variant-numeric:tabular-nums}
th,td{text-align:right;padding:6px 8px;white-space:nowrap;border-bottom:1px solid var(--edge-soft)}th:first-child,td:first-child{text-align:left}th{color:var(--mut);font-weight:500}
</style></head><body><main>
<h1>Visitas</h1>
<p class="mut">Pessoas por dia: browsers cuja página avisou que abriu. Conta desde 27 nov 2026, 18:31 UTC; os dias antes disso não têm este número.</p>
<div class="tiles">
<div class="tile"><b>${today.people === null || today.people === undefined ? '0' : fmt(today.people)}</b><span>pessoas hoje (até agora)</span></div>
<div class="tile"><b>${avg === null ? '…' : fmt(avg)}</b><span>${avg === null ? 'média diária: falta um dia completo' : `média dos últimos ${full.length} dias completos`}</span></div>
<div class="tile"><b>${fmt(today.browsers)}</b><span>pedidos com nome de browser hoje, quase todos robôs</span></div>
</div>
<div class="chart"><svg viewBox="0 0 ${W} ${H + 32}" role="img" aria-label="Pessoas por dia, últimos 30 dias">${grid}${bars}${ticks}</svg></div>
<table><thead><tr><th>Dia</th><th>Pessoas</th><th>Browsers</th><th>Robôs</th></tr></thead><tbody>${rows}</tbody></table>
<p class="mut">Browsers: endereços que pediram páginas com nome de browser, o número antigo. Robôs: pedidos de quem diz ser robô, monitor ou script.</p>
</main></body></html>`
}
