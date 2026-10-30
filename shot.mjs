// 手早くスクショを撮る。node shot.mjs [w] [h] [script]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
const ROOT = import.meta.dirname
const PORT = await new Promise(r => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const [w = 390, h = 844] = process.argv.slice(2).map(Number)
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: w, height: h }, locale: 'ja-JP' })
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__ekReady, null, { timeout: 15000 })
await p.waitForTimeout(2500)
await p.screenshot({ path: ROOT + '/shots/q-title.png' })
await p.evaluate(() => { localStorage.setItem('ek.how', '1') })
await p.click('#bStart'); await p.waitForTimeout(4200)
await p.screenshot({ path: ROOT + '/shots/q-play1.png' })
await p.waitForTimeout(2500)
await p.screenshot({ path: ROOT + '/shots/q-play2.png' })
const st = await p.evaluate(() => ({ t: ek.S.t, ph: ek.S.stop.ph, runners: ek.S.runners.map(r => r.type + ':' + r.state), riders: ek.S.riders.length, fps: ek.fps }))
console.log(JSON.stringify(st)); console.log(errs.join('\n'))
await b.close(); server.kill()
