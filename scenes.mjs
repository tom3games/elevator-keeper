// 場面ごとのスクショ。node scenes.mjs w h tag
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
const ROOT = import.meta.dirname
const PORT = await new Promise(r => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const [w, h] = [Number(process.argv[2] || 390), Number(process.argv[3] || 844)], tag = process.argv[4] || 'p'
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: w, height: h }, locale: process.env.EN ? 'en-US' : 'ja-JP' })
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.addInitScript(() => localStorage.setItem('ek.how', '1'))
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__ekReady)
const shot = n => p.screenshot({ path: `${ROOT}/shots/s-${tag}-${n}.png` })
await p.evaluate(() => { ek.startGame(4242); ek.dbg.pause(true); ek.S.phase = 'play'; document.querySelector('#count').hidden = true })
// 1. 最初の人が 7m まで来た
await p.evaluate(() => { ek.dbg.until(() => ek.S.runners.some(r => r.state === 'run' && r.z > -7)); ek.dbg.render() })
await p.waitForTimeout(100); await shot('1run')
// 2. 開けっぱなしで待たせてイライラ
await p.evaluate(() => { ek.setOpen(true); ek.S.irr = 82; ek.dbg.step(50); ek.dbg.render() })
await p.waitForTimeout(100); await shot('2irr')
// 3. 部長が来る階を探して、目の前で閉める
await p.evaluate(() => {
  for (let i = 0; i < 40; i++) {
    ek.dbg.until(() => ek.S.stop.ph === 'open' && ek.S.stop.pt > 0.3)
    const boss = ek.S.runners.find(r => r.type === 'boss')
    if (boss) { ek.setOpen(true); ek.dbg.until(() => boss.state === 'run' && boss.z > -2.2); ek.pressClose(); ek.dbg.until(() => boss.state === 'glass' && boss.gt > 0.5); break }
    ek.pressClose(); ek.dbg.until(() => ek.S.stop.ph === 'depart')
  }
  ek.S.irr = 20; ek.dbg.render()
})
await p.waitForTimeout(100); await shot('3glass')
// 4. 結果まで流す
await p.evaluate(() => { ek.setBot('normal', 3); ek.dbg.until(() => ek.S.phase === 'result', 60 * 120); ek.dbg.pause(false) })
await p.waitForTimeout(4500); await shot('4result')
console.log(errs.join('\n') || 'no errors')
await b.close(); server.kill()
