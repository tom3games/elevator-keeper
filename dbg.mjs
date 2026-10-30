import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
const ROOT = import.meta.dirname
const PORT = await new Promise(r => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch()
const p = await b.newPage()
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__ekReady)
const out = await p.evaluate((bot) => {
  const agg = {}; let nice = 0, stops = 0, raw = 0, max = 0, ex = 0
  for (let s = 1; s <= 30; s++) { const r = ek.sim(bot, s * 101); nice += r.nice; stops += r.stops; raw += r.raw; max += r.maxRaw; ex += r.explode; for (const [t, o] of r.list) { const k = t + ':' + o; agg[k] = (agg[k] || 0) + 1 } }
  return { agg, nice, stops, raw, max, ex }
}, process.argv[2] || 'good')
console.log(JSON.stringify(out))
await b.close(); server.kill()
