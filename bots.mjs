// ボットで点の分布を測る。node bots.mjs [回数]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
const ROOT = import.meta.dirname
const PORT = await new Promise(r => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const N = Number(process.argv[2] || 40)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__ekReady)
const out = await p.evaluate(N => {
  const res = {}
  for (const bot of ['good', 'normal', 'sloppy', 'none']) {
    const arr = []; for (let s = 1; s <= N; s++) arr.push(ek.sim(bot, s * 101))
    const sc = arr.map(a => a.score).sort((a, b) => a - b)
    const ranks = {}; for (const a of arr) ranks[a.rank] = (ranks[a.rank] || 0) + 1
    const avg = k => +(arr.reduce((s, a) => s + a[k], 0) / arr.length).toFixed(2)
    res[bot] = { mean: avg('score'), min: sc[0], med: sc[sc.length >> 1], max: sc.at(-1), ranks, people: avg('people'), stops: avg('stops'), bossOut: avg('bossOut'), buzz: avg('buzz'), explode: avg('explode') }
  }
  return res
}, N)
console.log(JSON.stringify(out, null, 1))
await b.close(); server.kill()
