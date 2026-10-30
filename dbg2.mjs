import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
const ROOT = import.meta.dirname
const PORT = await new Promise(r => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(); const p = await b.newPage()
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__ekReady)
console.log(await p.evaluate(() => {
  ek.startGame(4242); ek.dbg.pause(true); ek.S.phase = 'play'
  const out = []
  for (let i = 0; i < 40; i++) {
    ek.dbg.until(() => ek.S.stop.ph === 'open' && ek.S.stop.pt > 0.3)
    const boss = ek.S.runners.find(r => r.type === 'boss')
    if (boss) { ek.setOpen(true); ek.dbg.until(() => boss.state === 'run' && boss.z > -2.2); out.push(['pre', boss.state, boss.z]); ek.pressClose()
      for (let k = 0; k < 90; k++) { ek.dbg.step(1); if (k % 10 == 0) { const v = boss.g.getWorldPosition(new boss.g.position.constructor()); out.push([k, boss.state, boss.res, v.x.toFixed(2), v.y.toFixed(2), v.z.toFixed(2), boss.g.parent && boss.g.parent.type, ek.S.door.toFixed(2), ek.S.stop.ph]) } }
      break }
    ek.pressClose(); ek.dbg.until(() => ek.S.stop.ph === 'depart')
  }
  return JSON.stringify(out)
}))
await b.close(); server.kill()
