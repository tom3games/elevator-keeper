import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
import { chromium, webkit } from 'playwright'
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
mkdirSync(import.meta.dirname + '/shots', { recursive: true })
// 個人のアカウント名は公開リポジトリに書かない。実行時に gh から取る
const OWNER = (() => { try { return execSync('gh api user -q .login', { encoding: 'utf8' }).trim().toLowerCase() } catch { return '' } })()
const URL0 = 'https://tom3games.github.io/elevator-keeper/'
const out = []
let bad = 0
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 360, height: 640 }, ...opts })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__ekReady, null, { timeout: 20000 })
  const v = await p.evaluate(() => [...document.scripts].map(s => s.src.split('?v=')[1]).filter(Boolean).join('/'))
  // 通し: CPU に遊ばせて結果まで → 日英で結果カードが切れていないか（360x640）
  await p.evaluate(() => { ek.startGame(77); ek.dbg.pause(true); ek.S.phase = 'play'; document.querySelector('#count').hidden = true; ek.setBot('bad', 1); ek.dbg.until(() => ek.S.phase === 'result', 60 * 120); ek.dbg.pause(false) })
  await p.waitForTimeout(3600)
  const clip = () => p.evaluate(() => { const c = document.querySelector('#rCard'), f = document.querySelector('.rFoot').getBoundingClientRect(); return { lang: document.documentElement.lang, clip: c.scrollHeight - c.clientHeight, footOk: f.bottom <= innerHeight } })
  const ja = await clip()
  await p.click('#bLang'); await p.waitForTimeout(400)
  const en = await clip()
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); return r.status + ' ' + r.headers.get('content-type') })
  if (ja.clip > 1 || en.clip > 1 || !ja.footOk || !en.footOk || errs.length || !/^200 image/.test(og)) bad++
  out.push(`${name}: v=${v} result ja=${JSON.stringify(ja)} en=${JSON.stringify(en)} og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (!process.env.SKIPGH) {
  // ログアウト状態でリポジトリ・更新履歴に個人のIDが出ていないか
  const b = await chromium.launch(), p = await b.newPage()
  for (const u of ['https://github.com/tom3games/elevator-keeper', 'https://github.com/tom3games/elevator-keeper/commits/main']) {
    const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
    out.push(`${u} status=${res.status()} owner=${OWNER && (await p.content()).toLowerCase().includes(OWNER) ? 'FOUND' : 'none'}`)
  }
  await b.close()
}
console.log(out.join('\n'))
process.exit(bad ? 1 : 0)
