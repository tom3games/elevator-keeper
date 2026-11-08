// 全項目の自動検証。node verify.mjs（shots/ にスクショを出す）。BOTS=0 でボットの分布測定を省く
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
// 空いているポートを取る（他のゲームの検証と並行して走るため）
const PORT = await new Promise(r => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 500))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
// テストは必ず await する（しないと例外が素通りして全部 pass になる）
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)) }
const GPU = { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }
async function open(browser, opts = {}, init = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, acceptDownloads: true, ...opts })
  await ctx.addInitScript(init => { try { localStorage.clear(); for (const k in init) localStorage.setItem(k, init[k]) } catch (e) {} }, init)
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => p.errs.push('reqfail ' + r.url()))
  await p.goto(URL0); await p.waitForFunction(() => window.__ekReady, null, { timeout: 20000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('.view:not([hidden]) *, #corner *')) {
    if (el.closest('[hidden]') || el.closest('#bubbles') || el.id === 'caption' || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
// 一画面に収まる（縦スクロール不要・ボタンが画面内・文字が切れていない・ボタン同士が重ならない）
const fit = q => q.evaluate(() => {
  const H = innerHeight, W = innerWidth, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  const btns = [...document.querySelectorAll('.view:not([hidden]) button, #corner button')].filter(el => el.offsetParent || getComputedStyle(el).position === 'fixed')
  for (const el of btns) { const r = el.getBoundingClientRect(); if (!r.width) continue; if (r.bottom > H + 1 || r.top < -1 || r.right > W + 1 || r.left < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i].getBoundingClientRect(), b = btns[j].getBoundingClientRect()
    if (a.width && b.width && a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2 && !btns[i].contains(btns[j])) over.push('overlap:' + (btns[i].id || btns[i].className) + '/' + (btns[j].id || btns[j].className))
  }
  // 中身がはみ出して隠れている要素（カード類）
  for (const el of document.querySelectorAll('.view:not([hidden]) .howCard, .view:not([hidden]) .rCard')) if (el.scrollHeight > el.clientHeight + 2) over.push('clip:' + el.className + ':' + el.scrollHeight + '>' + el.clientHeight)
  // ボタンの文字が2行以上に折れていない
  for (const el of btns) { const s = el.querySelector('span[data-t]'); if (s && s.getClientRects().length > 1) over.push('wrap:' + el.id) }
  return { H, over: over.slice(0, 6) }
})
// 3D が描けているか（WebGL の画素の散らばり）
const glVar = p => p.evaluate(() => {
  ek.render(); const c = document.querySelector('#gl'), gl = c.getContext('webgl2') || c.getContext('webgl')
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
  let s = 0, s2 = 0, n = 0; for (let i = 0; i < px.length; i += 4 * 97) { const v = px[i] * .3 + px[i + 1] * .59 + px[i + 2] * .11; s += v; s2 += v * v; n++ }
  return Math.round(s2 / n - (s / n) ** 2)
})
// プレイ画面へ（カウントを飛ばして時間を止める）
const toPlay = (p, seed = 4242) => p.evaluate(seed => { ek.startGame(seed); ek.dbg.pause(true); ek.S.phase = 'play'; document.querySelector('#count').hidden = true }, seed)
// Xでポスト: 押すと新しいタブで x.com/intent/post が開く（x.com は偽の応答で受ける）
async function xPost(pg) {
  await pg.context().route('https://x.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>x</title>ok' }))
  const b = await pg.evaluate(() => { const el = document.querySelector('#bX'), r = el.getBoundingClientRect(); return { vis: !!el.offsetParent && r.width > 60 && r.height >= 38, clip: el.scrollWidth > el.clientWidth + 1, label: el.innerText.trim() } })
  const [pop] = await Promise.all([pg.waitForEvent('popup', { timeout: 6000 }), pg.click('#bX')])
  await pop.waitForLoadState().catch(() => {}); const url = pop.url(); await pop.close()
  const u = new URL(url), api = await pg.evaluate(() => ({ text: ek.xText(), url: ek.GAME_URL, score: ek.S.result.score, title: document.querySelector('#rTitle').firstChild.textContent, rank: document.querySelector('#rRank').textContent }))
  return { b, url, text: u.searchParams.get('text'), link: u.searchParams.get('url'), api }
}
const clipped = q => q.evaluate(() => [...document.querySelectorAll('.view:not([hidden]) button')].filter(b => b.offsetParent && b.scrollWidth > b.clientWidth + 1).map(b => b.id))
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [667, 375, 'land-se'], [430, 932, 'max'], [768, 1024, 'tab'], [1440, 900, 'pc']]

const browser = await chromium.launch(GPU)
let p = await open(browser)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス・文字選択）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', r)
})
await t('OGP 一式（og:image は公開URLの og.png?v=）と og.png が 1200x630', async () => {
  const r = await p.evaluate(() => Object.fromEntries(['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => [k, document.querySelector(`meta[property="${k}"]`)?.content]).concat([['tw', document.querySelector('meta[name="twitter:card"]')?.content]])))
  expect(Object.values(r).every(Boolean) && r['og:image'].startsWith('https://tom3games.com/play/elevator-keeper/og.png?v=') && r['og:url'] === 'https://tom3games.com/play/elevator-keeper/' && r.tw === 'summary_large_image', r)
  const b = readFileSync(ROOT + '/og.png'); expect(b.readUInt32BE(16) === 1200 && b.readUInt32BE(20) === 630, 'og.png size')
})
await t('初回の読み込みが 3MB 以内', async () => {
  const files = ['index.html', 'data.js', 'snd.js', 'game.js', 'vendor/three.module.js', 'vendor/three.core.js']
  const sum = files.reduce((a, f) => a + statSync(ROOT + '/' + f).size, 0); expect(sum < 3 * 1024 * 1024, sum); return Math.round(sum / 1024) + 'KB'
})
await t('タイトルが日本語・3D が描けている', async () => {
  await p.waitForTimeout(800)
  const s = await p.textContent('.logo .l2'), v = await glVar(p); expect(s.includes('開閉係') && v > 200, { s, v }); return { v }
})
await t('タイトルの裏でお手本のエレベーターが動いている（人が走ってくる）', async () => {
  await p.waitForTimeout(3500); const r = await p.evaluate(() => ({ stops: ek.S.stopN, ppl: ek.S.runners.length + ek.S.log.people })); expect(r.ppl > 0, r); return r
})
await p.screenshot({ path: ROOT + '/shots/01-title.png' })

// ---------- 初回は遊び方 → はじめる → カウント → プレイ
await p.click('#bStart')
await t('初回は「出勤する」で遊び方が出る（PC の言い方）', async () => { expect(await p.isVisible('#vHow'), 'how'); const s = await p.textContent('#howCtl'); expect(/A/.test(s) && /Space/.test(s), s) })
await p.screenshot({ path: ROOT + '/shots/02-how.png' })
await p.click('#bHowGo')
await t('カウントダウンのあと始まる', async () => {
  expect(await p.isVisible('#count'), 'count'); await p.waitForFunction(() => ek.S.phase === 'play', null, { timeout: 6000 }); expect(await p.isHidden('#count'), 'count hidden')
})
await t('時間は実時間どおりに進む（固定60Hz）', async () => {
  const a = await p.evaluate(() => [ek.S.t, performance.now()]); await p.waitForTimeout(2000); const b = await p.evaluate(() => [ek.S.t, performance.now()])
  const k = (b[0] - a[0]) / ((b[1] - a[1]) / 1000); expect(k > 0.85 && k < 1.1, k); return +k.toFixed(3)
})
await t('fps が 50 以上（プレイ中）', async () => { await p.waitForTimeout(1200); const f = await p.evaluate(() => ek.fps); expect(f >= 50, f); return Math.round(f) })
await t('キー ← で「開」が入り、もう一度で切れる。→ で「閉」', async () => {
  await p.evaluate(() => ek.dbg.until(() => ek.S.stop.ph === 'open'))
  await p.keyboard.press('ArrowLeft'); const a = await p.evaluate(() => ek.S.openOn)
  await p.keyboard.press('ArrowLeft'); const b = await p.evaluate(() => ek.S.openOn)
  await p.keyboard.press('ArrowRight'); const c = await p.evaluate(() => ek.S.force)
  expect(a === true && b === false && c === true, { a, b, c }); return { a, b, c }
})
await t('画面の「開」「閉」ボタンも効く（開は光る）', async () => {
  await p.evaluate(() => ek.dbg.until(() => ek.S.stop.ph === 'open'))
  await p.click('#bOpen'); await p.waitForTimeout(150); const a = await p.evaluate(() => [ek.S.openOn, document.querySelector('#bOpen').classList.contains('on')])
  await p.click('#bClose'); const b = await p.evaluate(() => [ek.S.openOn, ek.S.force])
  expect(a[0] && a[1] && !b[0] && b[1], { a, b })
})
await p.screenshot({ path: ROOT + '/shots/03-play.png' })
await t('音: BGM・到着チャイム・ボタン音が鳴ってエラーなし', async () => {
  await p.waitForTimeout(1500); const r = await p.evaluate(() => ({ played: ek.Snd.played, state: ek.Snd.ctx && ek.Snd.ctx.state }))
  expect((r.played['bgm:muzak'] || r.state === 'suspended') && r.played.ding && r.played.tap && !p.errs.length, r); return Object.keys(r.played).join(',')
})

// ---------- 遊びの仕組み（時間を止めて台本どおりに進める）
await toPlay(p, 777)
// 指定の種類が来る階まで進める（来なければ閉めて次へ）
const findStop = (p, type) => p.evaluate(type => {
  for (let i = 0; i < 60; i++) {
    ek.S.t = 0; ek.S.ending = false
    ek.dbg.until(() => ek.S.stop.ph === 'open')
    const r = ek.S.runners.find(r => r.type === type)
    if (r) { r.spawnAt = 0; for (const o of ek.S.runners) if (o !== r) o.spawnAt = 99; return true }
    ek.pressClose(); ek.dbg.until(() => ek.S.stop.ph === 'arrive')
  }
  return false
}, type)
await t('部長を「開」で待つと乗る（乗せた人に部長）', async () => {
  await p.evaluate(() => { ek.S.t = 0; ek.S.ending = false })
  expect(await findStop(p, 'boss'), 'no boss')
  const r = await p.evaluate(() => { ek.setOpen(true); const b = ek.S.runners.find(r => r.type === 'boss'); ek.dbg.until(() => b.res); return { res: b.res, inBoss: ek.S.log.in.boss } })
  expect(r.res === 'in' && r.inBoss >= 1, r); return r
})
await t('部長の目の前で閉めると閉め出し（ガラスに顔・回数が増える）', async () => {
  await p.evaluate(() => { ek.pressClose(); ek.dbg.until(() => ek.S.stop.ph === 'arrive'); ek.S.t = 0 })
  expect(await findStop(p, 'boss'), 'no boss')
  const r = await p.evaluate(() => {
    const b = ek.S.runners.find(r => r.type === 'boss'), n0 = ek.S.log.bossOut
    ek.setOpen(true); ek.dbg.until(() => b.state === 'run' && b.z > -2.2); ek.pressClose()
    ek.dbg.until(() => b.state === 'glass' && b.gt > 0.3)
    return { res: b.res, state: b.state, inc: ek.S.log.bossOut - n0, z: b.g.position.z, door: ek.S.door }
  })
  expect(r.res === 'out' && r.inc === 1 && r.state === 'glass' && r.door === 0, r); return r
})
await t('ガラスに押しつけた顔や荷物がドアを突き抜けない（全種類）', async () => {
  const bad = []
  await p.evaluate(() => { ek.S.stop.t = 0 })
  for (const ty of ['boss', 'luggage', 'elderly', 'normal', 'sweaty', 'phone']) {
    await p.evaluate(() => { ek.dbg.until(() => ek.S.stop.ph === 'arrive'); ek.S.t = 0 })
    if (!await findStop(p, ty)) { bad.push(ty + ':none'); continue }
    bad.push(...await p.evaluate(ty => {
      const P = ek.S.runners.find(r => r.type === ty)
      ek.setOpen(true); ek.dbg.until(() => P.state === 'run' && P.z > -1.6); ek.pressClose(); ek.dbg.until(() => P.state === 'glass')
      ek.S.stop.t = -5; ek.dbg.step(60); P.g.updateMatrixWorld(true)
      const out = [], bb = new ek.THREE.Box3()
      P.g.traverse(o => { if (o.isMesh) { bb.setFromObject(o); if (bb.max.z > -0.01) out.push(ty + ':' + bb.max.z.toFixed(3)) } })
      return out
    }, ty))
  }
  expect(!bad.length, bad)
})
await t('フェイント: 開けて待つと「待たされた」、閉めれば回避', async () => {
  await p.evaluate(() => { ek.dbg.until(() => ek.S.stop.ph === 'arrive'); ek.S.t = 0 })
  expect(await findStop(p, 'feint'), 'no feint')
  const a = await p.evaluate(() => { ek.setOpen(true); const f = ek.S.runners.find(r => r.type === 'feint'); ek.dbg.until(() => f.res); ek.dbg.step(120); return { res: f.res, state: f.state } })
  await p.evaluate(() => { ek.pressClose(); ek.dbg.until(() => ek.S.stop.ph === 'arrive'); ek.S.t = 0 })
  expect(await findStop(p, 'feint'), 'no feint 2')
  const b = await p.evaluate(() => { ek.dbg.step(30); ek.pressClose(); const f = ek.S.runners.find(r => r.type === 'feint'); ek.dbg.until(() => f.res); return { res: f.res } })
  expect(a.res === 'fooled' && (a.state === 'vend' || a.state === 'swerve') && b.res === 'dodged', { a, b }); return { a, b }
})
await t('満員（8人）で乗せるとブザー（乗れずに降りる）', async () => {
  await p.evaluate(() => { ek.pressClose(); ek.dbg.until(() => ek.S.stop.ph === 'arrive'); ek.S.t = 0 })
  expect(await findStop(p, 'normal'), 'no normal')
  // 満員にするのは窓口から
  const r2 = await p.evaluate(() => {
    ek.fillCar(8); const n = ek.carCount(); const b0 = ek.S.log.buzz
    ek.setOpen(true); const f = ek.S.runners.find(r => r.type === 'normal'); ek.dbg.until(() => f.res); ek.dbg.step(150)
    return { n, res: f.res, buzz: ek.S.log.buzz - b0, after: ek.carCount(), state: f.state, played: !!ek.Snd.played.buzz }
  })
  expect(r2.n === 8 && r2.res === 'buzz' && r2.buzz === 1 && r2.after === 8 && r2.state === 'shame', r2); return r2
})
await t('何も押さないと扉は自動で閉まり、遠くの人は閉め出される', async () => {
  await p.evaluate(() => { ek.pressClose(); ek.dbg.until(() => ek.S.stop.ph === 'arrive'); ek.S.t = 0 })
  const r = await p.evaluate(() => { ek.dbg.until(() => ek.S.stop.ph === 'open'); for (const o of ek.S.runners) { o.spawnAt = 0; o.z = -30 } const n = ek.dbg.until(() => ek.S.stop.ph === 'closed', 2000); return { sec: +(n / 60).toFixed(2), res: ek.S.runners.map(r => r.res) } })
  expect(r.sec > 2.5 && r.sec < 6 && r.res.every(x => x === 'out' || x === 'dodged'), r); return r
})
await t('待たせすぎると車内大爆発（回数と減点）', async () => {
  const r = await p.evaluate(() => { ek.dbg.until(() => ek.S.stop.ph === 'open'); ek.setOpen(true); const e0 = ek.S.log.explode, raw0 = ek.S.raw; ek.S.irr = 99; ek.dbg.step(120); return { inc: ek.S.log.explode - e0, raw: ek.S.raw - raw0, irr: ek.S.irr } })
  expect(r.inc === 1 && r.raw <= -12, r); return r
})
await t('同じ種と同じ操作なら同じ点（再現性）', async () => {
  const r = await p.evaluate(() => [ek.sim('good', 5), ek.sim('good', 5), ek.sim('normal', 9), ek.sim('normal', 9)].map(x => x.score))
  expect(r[0] === r[1] && r[2] === r[3], r); return r
})
if (process.env.BOTS !== '0') {
  await t('難しさ: ボットの点の分布（上手い＞ふつう＞雑・何もしない、上手いと S がたまに出る）', async () => {
    const r = await p.evaluate(() => {
      const out = {}
      for (const bot of ['good', 'normal', 'sloppy', 'none']) {
        const arr = []; for (let s = 1; s <= 60; s++) arr.push(ek.sim(bot, s * 101))
        const sc = arr.map(a => a.score), ranks = {}; for (const a of arr) ranks[a.rank] = (ranks[a.rank] || 0) + 1
        out[bot] = { mean: +(sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1), min: Math.min(...sc), max: Math.max(...sc), ranks, people: +(arr.reduce((a, b) => a + b.people, 0) / arr.length).toFixed(1) }
      }
      return out
    })
    expect(r.good.mean > r.normal.mean + 10 && r.normal.mean > r.sloppy.mean + 15 && r.normal.mean > r.none.mean + 15 && (r.good.ranks.S || 0) >= 1 && (r.good.ranks.S || 0) <= 15 && r.good.mean < 85 && r.none.mean < 25, r)
    return r
  })
}

// ---------- 通しで最後まで（ボットに任せて実時間を早回し）→ 結果発表
await t('60秒で終わって結果発表（点は発表まで出ない→数え上げ→ハンコ）', async () => {
  await p.evaluate(() => { ek.startGame(31337); ek.dbg.pause(true); ek.S.phase = 'play'; document.querySelector('#count').hidden = true; ek.setBot('normal', 4); ek.dbg.until(() => ek.S.phase === 'result', 60 * 120); ek.dbg.pause(false) })
  const r0 = await p.evaluate(() => ({ t: ek.S.t, vis: !document.querySelector('#vResult').hidden, rank: document.querySelector('#rRank').classList.contains('on'), sc: document.querySelector('#rScore').textContent }))
  await p.waitForTimeout(3800)
  const r1 = await p.evaluate(() => ({ sc: +document.querySelector('#rScore').textContent, want: ek.S.result.score, rank: document.querySelector('#rRank').classList.contains('on'), title: document.querySelector('#rTitle').textContent, boss: document.querySelector('#rBossN').textContent }))
  expect(r0.vis && r0.t >= 60 && r0.t < 66 && !r0.rank && r1.rank && r1.sc === r1.want && r1.title.length > 1, { r0, r1 }); return { t: +r0.t.toFixed(1), ...r1 }
})
await p.screenshot({ path: ROOT + '/shots/04-result.png' })
await t('結果画像（1080x1350）が描けて保存できる', async () => {
  const v = await p.evaluate(async () => { const c = await ek.makeCard(ek.S.result); const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 61) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ } return { w: c.width, h: c.height, v: Math.round(s2 / n - (s / n) ** 2), snap: !!ek.S.result.snap } })
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.click('#bSave')])
  await dl.saveAs(ROOT + '/shots/05-card.png')
  expect(v.w === 1080 && v.h === 1350 && v.v > 500 && /elevator-keeper-\d+\.png/.test(dl.suggestedFilename()), { v, f: dl.suggestedFilename() }); return { ...v, file: dl.suggestedFilename() }
})
await t('Xでポスト: ボタンが見えて、押すと x.com/intent/post が開く（text に点・ランク・称号とハッシュタグ、url に公開URL）', async () => {
  const r = await xPost(p)
  expect(r.b.vis && !r.b.clip && r.b.label === 'Xでポスト' && r.url.startsWith('https://x.com/intent/post?') && r.text.includes('空気読み力' + r.api.score + '%') && r.text.includes(r.api.rank + 'ランク「' + r.api.title + '」') && r.text.endsWith('#エレベーター開閉係') && !r.text.includes('tom3games') && r.link === 'https://tom3games.github.io/elevator-keeper/' && r.text === r.api.text && r.link === r.api.url, r); return r.text
})
await t('もう一回ですぐ遊べる', async () => {
  await p.click('#bAgain'); await p.waitForFunction(() => ek.S.phase === 'play', null, { timeout: 6000 })
  const r = await p.evaluate(() => ({ t: ek.S.t, people: ek.S.log.people, bossOut: ek.S.log.bossOut })); expect(r.t < 2 && r.bossOut === 0, r)
})
await t('英語に切り替えると全部英語（タイトル・遊び方・結果）', async () => {
  await p.evaluate(() => ek.startTitle()); await p.click('#bLang')
  const a = await p.evaluate(() => [document.querySelector('.logo .l1').textContent, document.querySelector('#bStart').textContent, document.documentElement.lang])
  await p.screenshot({ path: ROOT + '/shots/06-title-en.png' })
  await p.click('#bHow'); const b = await p.textContent('#vHow'); await p.screenshot({ path: ROOT + '/shots/07-how-en.png' })
  await p.evaluate(() => { ek.startGame(5); ek.dbg.pause(true); ek.S.phase = 'play'; document.querySelector('#count').hidden = true; ek.setBot('good', 2); ek.dbg.until(() => ek.S.phase === 'result', 60 * 120); ek.dbg.pause(false) })
  await p.waitForTimeout(3500); const c = await p.textContent('#vResult'); await p.screenshot({ path: ROOT + '/shots/08-result-en.png' })
  const jp = /[぀-ヿ一-龯]/
  const x = await xPost(p)
  expect(x.b.vis && !x.b.clip && x.b.label === 'Post on X' && x.url.startsWith('https://x.com/intent/post?') && x.text.includes('Room-reading ' + x.api.score + '%') && x.text.includes('"' + x.api.title + '"') && x.text.endsWith('#HoldTheDoorGame') && !jp.test(x.text) && x.link === 'https://tom3games.github.io/elevator-keeper/', x)
  expect(a[0] === 'HOLD THE' && a[2] === 'en' && !jp.test(b.replace(/開|閉/g, '')) && !jp.test(c), { a, b: b.slice(0, 80), c: c.slice(0, 120) })
  await p.click('#bLang')
})
await t('ミュートが効いて覚えている', async () => {
  await p.click('#bMute'); const a = await p.evaluate(() => [ek.Snd.muted, localStorage.getItem('ek.mute')]); await p.click('#bMute')
  expect(a[0] === true && a[1] === '1', a)
})
await t('ここまでエラーなし', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await p.close()

// ---------- 6サイズ × 全画面で一画面に収まる
for (const [w, h, name] of SIZES) {
  const q = await open(browser, { viewport: { width: w, height: h } })
  const views = {}
  await q.waitForTimeout(500)
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-1title.png` })
  await q.click('#bHow'); await q.waitForTimeout(450); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-2how.png` })
  await q.click('#bHowGo'); await q.waitForFunction(() => ek.S.phase === 'play', null, { timeout: 6000 })
  await q.evaluate(() => { ek.dbg.pause(true); ek.dbg.until(() => ek.S.runners.some(r => r.state === 'run' && r.z > -6)); ek.setOpen(true); ek.S.irr = 70; ek.dbg.step(30); ek.dbg.render() })
  views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-3play.png` })
  await q.evaluate(() => { ek.setBot('normal', 4); ek.dbg.until(() => ek.S.phase === 'result', 60 * 120); ek.dbg.pause(false) })
  await q.waitForTimeout(3600)
  views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-4result.png` })
  const clipJa = await clipped(q), xVis = await q.evaluate(() => !!document.querySelector('#bX').offsetParent)
  await q.click('#bLang'); await q.waitForTimeout(300); views.resultEn = await fit(q); const clipEn = await clipped(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-5result-en.png` }); await q.click('#bLang')
  await t(`${name}: 結果のボタン（Xでポスト含む）の文字が切れない（日英）`, async () => { expect(!clipJa.length && !clipEn.length && xVis, { clipJa, clipEn, xVis }) })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, r) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
await browser.close()

// ---------- WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch()
const wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: タップで遊び方（スマホの言い方）→ プレイ → 開/閉をタップ', async () => {
  await wp.tap('#bStart'); const s = await wp.textContent('#howCtl'); expect(/タップ/.test(s), s)
  await wp.tap('#bHowGo'); await wp.waitForFunction(() => ek.S.phase === 'play', null, { timeout: 8000 })
  await wp.evaluate(() => ek.dbg.until(() => ek.S.stop.ph === 'open'))
  await wp.tap('#bOpen'); const a = await wp.evaluate(() => ek.S.openOn)
  await wp.tap('#bClose'); const b = await wp.evaluate(() => ek.S.force)
  expect(a && b, { a, b })
})
await wp.waitForTimeout(1500)
await wp.screenshot({ path: ROOT + '/shots/09-webkit-play.png' })
await t('WebKit: 3D が描けている', async () => { const v = await glVar(wp); expect(v > 200, v); return v })
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
