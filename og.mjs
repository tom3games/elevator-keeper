// SNS用サムネ og.png（1200x630）。部長を目の前で閉め出し、ガラスに顔が押しつけられた瞬間＋タイトル。node og.mjs
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
const ROOT = import.meta.dirname
const PORT = await new Promise(r => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 500))
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__ekReady)
const info = await p.evaluate(() => {
  ek.startGame(4242); ek.dbg.pause(true); ek.S.phase = 'play'; document.querySelector('#count').hidden = true
  for (let i = 0; i < 40; i++) {
    ek.dbg.until(() => ek.S.stop.ph === 'open' && ek.S.stop.pt > 0.3)
    const boss = ek.S.runners.find(r => r.type === 'boss')
    if (boss) {
      for (const o of ek.S.runners) if (o !== boss) o.spawnAt = 99
      ek.fillCar(6); ek.setOpen(true); ek.dbg.until(() => boss.state === 'run' && boss.z > -2.2); ek.pressClose()
      ek.dbg.until(() => boss.state === 'glass' && boss.gt > 0.25)
      return { ok: true, x: boss.g.position.x }
    }
    ek.pressClose(); ek.dbg.until(() => ek.S.stop.ph === 'arrive')
  }
})
await p.evaluate(() => {
  ek.S.irr = 75
  // 車内の人は振り向いてにらむ
  for (const r of ek.S.riders) if (r.type === 'rider') { r.head.rotation.y = (r.g.position.x < 0 ? -1 : 1) * 1.9; ek.setFace(r, Math.random() < 0.5 ? 'glare' : 'angry') }
  ek.CAM.set(0, 1.58, 1.75)
  const c = ek.camera; c.setViewOffset(1560, 630, 340, 0, 1200, 630); c.updateProjectionMatrix()
  ek.dbg.render()
})
await p.addStyleTag({ content: `#hud,#ctl,#corner,#caption,.sb.rider{display:none!important}
  body::after{content:'';position:fixed;inset:0 0 0 50%;background:linear-gradient(90deg,rgba(27,31,59,0),rgba(27,31,59,.94) 22%);z-index:30}` })
await p.evaluate(() => {
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:34px;top:0;bottom:0;width:500px;z-index:31;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:18px;color:#fff;text-align:center;font-family:Hiragino Sans,sans-serif'
  d.innerHTML = `<div style="font-weight:900;font-size:46px;letter-spacing:.06em;text-shadow:0 3px 0 #1b1f3b">エレベーター</div>
  <div style="font-weight:900;font-size:118px;line-height:1;color:#e8b84a;-webkit-text-stroke:3px #1b1f3b;text-shadow:0 7px 0 #e5383b,0 12px 0 #1b1f3b;transform:rotate(-3deg)">開閉係</div>
  <div style="margin-top:6px;font-weight:900;font-size:20px;letter-spacing:.2em;padding:6px 16px;border-radius:99px;background:#e5383b">HOLD THE DOOR?</div>
  <div style="font-weight:900;font-size:30px;line-height:1.5;margin-top:6px">走ってくるその人、<br>乗せる？乗せない？</div>`
  document.body.appendChild(d)
  // 部長の一言を大きく
  for (const el of document.querySelectorAll('.sb.angry')) { el.style.fontSize = '22px'; el.style.padding = '8px 14px' }
})
await p.evaluate(() => ek.dbg.render())
await p.waitForTimeout(400)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok', JSON.stringify(info))
