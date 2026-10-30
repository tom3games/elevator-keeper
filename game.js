// エレベーター開閉係 / HOLD THE DOOR?
// エレベーターの中から廊下を見て、走ってくる人を乗せるか閉め出すか決める。3D は three.js、時間は固定60Hz（performance.now で数える）
import * as THREE from './vendor/three.module.js'
if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath() }

const D = window.EK_DATA, TYPES = D.TYPES
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)]
const STEP = 1 / 60
const clamp = (v, a, b) => v < a ? a : v > b ? b : v
const lerp = (a, b, k) => a + (b - a) * k
const ease = k => k * k * (3 - 2 * k)
const store = { get(k, d) { try { const v = localStorage.getItem('ek.' + k); return v == null ? d : v } catch (e) { return d } }, set(k, v) { try { localStorage.setItem('ek.' + k, v) } catch (e) {} } }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window
if (isTouch) document.body.classList.add('touch')
const pick = a => a[Math.floor(Math.random() * a.length)]

// ---------- ゲームの定数
const GAME_T = 60, CAP = 8, GRACE = 1.0, AUTO_T = 2.6, SNAP_T = 0.9
const DOOR_OPEN_V = 2.6, DOOR_FORCE_V = 3.0, DOOR_AUTO_V = 0.75
const SLOTS = [[-0.7, 0.45], [0.7, 0.45], [-1.0, 1.05], [1.0, 1.05], [-1.0, 1.65], [1.0, 1.65], [-0.95, 2.3], [0.95, 2.3]]

// ---------- 状態
const S = {
  lang: store.get('lang', (navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en'),
  phase: 'title', demo: true, headless: false, paused: false,
  t: 0, seed: 1, rng: Math.random, stopN: 0, floor: 3,
  door: 0, openOn: false, force: false, auto: false,
  irr: 0, raw: 0, maxRaw: 0, log: null, runners: [], riders: [], stop: null, ending: false, over: false,
  bot: null, cd: 0, snapPri: 0, snapImg: null, snapWant: 0, shake: 0, flash: 0,
}
const T = k => D.TXT[S.lang][k] ?? D.TXT.ja[k] ?? k

// ---------- 描画の土台
const canvas = $('#gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch || devicePixelRatio < 2, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.6 : 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene()
scene.background = new THREE.Color('#151829')
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 80)
const CAM = new THREE.Vector3(0, 1.62, 2.72), CAM_T = new THREE.Vector3(0, 1.3, -10)
scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6a5a4a, 1.5))
const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(2, 6, 3); scene.add(sun)
const MAT = {}
const lam = (c, o) => { const k = c + (o ? JSON.stringify(o) : ''); return MAT[k] || (MAT[k] = new THREE.MeshLambertMaterial({ color: c, ...o })) }
const basic = (c, o) => { const k = 'b' + c + (o ? JSON.stringify(o) : ''); return MAT[k] || (MAT[k] = new THREE.MeshBasicMaterial({ color: c, ...o })) }
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]) }
  t.userData = { canvas: c }
  return t
}
const BOX = new THREE.BoxGeometry(1, 1, 1)
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z); if (parent) parent.add(m); return m }

// ---------- かご（エレベーターの中）
const car = new THREE.Group(); scene.add(car)
const hall = new THREE.Group(); scene.add(hall)
;(() => {
  const steel = new THREE.MeshPhongMaterial({ color: 0xb6bcc8, shininess: 70, specular: 0x666666 })
  const steelDk = new THREE.MeshPhongMaterial({ color: 0x8b919e, shininess: 40 })
  const floorTex = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#4a3b33'; x.fillRect(0, 0, w, h); x.fillStyle = '#56463d'; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) x.fillRect(i * 32, j * 32, 32, 32) }, [2, 2])
  box(2.5, 0.04, 2.95, new THREE.MeshLambertMaterial({ map: floorTex }), 0, -0.02, 1.47, car)
  box(0.04, 2.5, 2.95, steel, -1.25, 1.25, 1.47, car); box(0.04, 2.5, 2.95, steel, 1.25, 1.25, 1.47, car)
  box(2.5, 2.5, 0.04, steelDk, 0, 1.25, 2.95, car)
  box(2.5, 0.04, 2.95, lam(0x6f7480), 0, 2.5, 1.47, car)
  for (const z of [1.1, 2.1]) for (const xx of [-0.5, 0.5]) { const dl = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), basic(0xe9e2cf)); dl.rotation.x = Math.PI / 2; dl.position.set(xx, 2.475, z); car.add(dl) } // 天井の明かり
  // 手すり
  for (const sx of [-1, 1]) box(0.04, 0.04, 2.4, lam(0xd8c48a), sx * 1.2, 0.95, 1.6, car)
  box(2.3, 0.04, 0.04, lam(0xd8c48a), 0, 0.95, 2.9, car)
  // 正面の壁（ドアの両脇と上）
  box(0.5, 2.5, 0.08, steelDk, -1.0, 1.25, 0.04, car); box(0.5, 2.5, 0.08, steelDk, 1.0, 1.25, 0.04, car)
  box(1.5, 0.4, 0.08, steelDk, 0, 2.3, 0.04, car)
  // 操作盤（右の壁）
  const panel = box(0.04, 0.6, 0.22, lam(0x2a2d38), 1.22, 1.15, 0.35, car)
  for (let i = 0; i < 6; i++) box(0.02, 0.05, 0.05, basic(i === 2 ? 0xffc94a : 0xe8e8e8), 1.2, 0.95 + i * 0.07, 0.35, car)
  void panel
})()
// 階数表示（ドアの上）
const floorTex = canvasTex(256, 96, () => {})
const floorDisp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: floorTex }))
floorDisp.position.set(0, 2.28, 0.09); car.add(floorDisp)
function drawFloor(up) {
  const c = floorTex.userData.canvas, x = c.getContext('2d')
  x.fillStyle = '#111'; x.fillRect(0, 0, 256, 96); x.fillStyle = '#ff9a2a'; x.font = '900 64px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'
  x.fillText(S.floor + 'F', 150, 52)
  if (up) { x.beginPath(); x.moveTo(40, 66); x.lineTo(66, 26); x.lineTo(92, 66); x.closePath(); x.fill() }
  floorTex.needsUpdate = true
}
drawFloor(false)
// ドア（窓つき。右は左右反転）
const doors = []
;(() => {
  const mat = new THREE.MeshPhongMaterial({ color: 0xc9ced8, shininess: 90, specular: 0x888888 })
  const glass = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.16, depthWrite: false })
  for (const sx of [-1, 1]) {
    const g = new THREE.Group()
    // 内側の端（中央寄り）が +x。窓は x 0.055〜0.295、y 1.0〜1.8
    box(0.43, 2.1, 0.05, mat, -0.16, 1.05, 0, g); box(0.08, 2.1, 0.05, mat, 0.335, 1.05, 0, g)
    box(0.24, 1.0, 0.05, mat, 0.175, 0.5, 0, g); box(0.24, 0.3, 0.05, mat, 0.175, 1.95, 0, g)
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.8), glass); gl.position.set(0.175, 1.4, 0); g.add(gl)
    box(0.012, 2.1, 0.06, lam(0x6b707c), 0.37, 1.05, 0, g)
    g.scale.x = sx === -1 ? 1 : -1
    g.position.z = -0.03
    car.add(g); doors.push({ g, sx })
  }
})()
function placeDoors() { const o = S.door * 0.74; doors[0].g.position.x = -0.375 - o; doors[1].g.position.x = 0.375 + o }

// ---------- 廊下（かごの外。出発すると上下に流れる）
const POSTERS = [['整理整頓', '#2e7d5b'], ['階段を使おう', '#c0392b'], ['ノー残業デー', '#2c5aa0'], ['報連相', '#8e44ad']]
const posterMats = POSTERS.map(([s, c]) => new THREE.MeshLambertMaterial({ map: canvasTex(128, 176, (x, w, h) => {
  x.fillStyle = '#fbf7ee'; x.fillRect(0, 0, w, h); x.fillStyle = c; x.fillRect(0, 0, w, 40); x.fillRect(10, h - 22, w - 20, 8)
  x.fillStyle = '#fff'; x.font = '900 18px sans-serif'; x.textAlign = 'center'; x.fillText('お知らせ', w / 2, 27)
  x.fillStyle = c; x.font = '900 ' + (s.length > 4 ? 20 : 26) + 'px sans-serif'; const half = Math.ceil(s.length / 2)
  x.fillText(s.slice(0, half), w / 2, 92); x.fillText(s.slice(half), w / 2, 124)
}) }))
const floorPlate = canvasTex(128, 64, () => {})
function drawPlate() { const c = floorPlate.userData.canvas, x = c.getContext('2d'); x.fillStyle = '#20263f'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#fff'; x.font = '900 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(S.floor + 'F', 64, 34); floorPlate.needsUpdate = true }
let vendMesh
;(() => {
  const tile = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#d9d2c3'; x.fillRect(0, 0, w, h); x.strokeStyle = '#bdb4a2'; x.lineWidth = 4; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, h); x.stroke(); x.beginPath(); x.moveTo(0, i * 64); x.lineTo(w, i * 64); x.stroke() } }, [2, 13])
  box(3.4, 0.04, 28, new THREE.MeshLambertMaterial({ map: tile }), 0, -0.02, -13.6, hall)
  const wall = lam(0xefe6d2), wain = lam(0x8a6d4e)
  for (const sx of [-1, 1]) {
    box(0.06, 2.8, 28, wall, sx * 1.7, 1.4, -13.6, hall)
    box(0.07, 0.9, 28, wain, sx * 1.69, 0.45, -13.6, hall)
    for (const z of [-8, -14.5, -21]) { box(0.08, 2.05, 0.95, lam(0x9b7653), sx * 1.66, 1.03, z, hall); box(0.09, 0.05, 0.05, lam(0xd8c48a), sx * 1.62, 1.0, z + sx * 0.35, hall) }
  }
  for (const [i, z] of [[0, -6], [1, -11.2], [2, -17.5], [3, -24]].entries()) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), posterMats[z[0]]); const sx = i % 2 ? 1 : -1; m.position.set(sx * 1.66, 1.55, z[1]); m.rotation.y = -sx * Math.PI / 2; hall.add(m) }
  box(3.4, 0.05, 28, lam(0xf4f0e6), 0, 2.8, -13.6, hall)
  for (let z = -1.5; z > -27; z -= 3) box(0.9, 0.03, 0.5, basic(0xfffdf3), 0, 2.77, z, hall)
  // 奥の窓（ビル街）
  const city = canvasTex(256, 192, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#7cc4ff'); g.addColorStop(1, '#dff1ff'); x.fillStyle = g; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 14; i++) { const bw = 14 + (i * 37) % 22, bh = 50 + (i * 53) % 100, bx = (i * 19) % w; x.fillStyle = ['#8aa3c4', '#9fb4d0', '#7b93b6'][i % 3]; x.fillRect(bx, h - bh, bw, bh); x.fillStyle = 'rgba(255,255,255,.5)'; for (let k = h - bh + 6; k < h - 6; k += 10) x.fillRect(bx + 3, k, bw - 6, 3) }
  })
  const win = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.0), new THREE.MeshBasicMaterial({ map: city })); win.position.set(0, 1.4, -27.5); hall.add(win)
  box(3.4, 0.08, 0.1, lam(0xffffff), 0, 1.4, -27.45, hall)
  // 観葉植物
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 10), lam(0xb5651d)); pot.position.set(-1.35, 0.2, -2.6); hall.add(pot)
  const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), lam(0x3f8f4f, { flatShading: true })); leaf.position.set(-1.35, 0.75, -2.6); leaf.scale.y = 1.3; hall.add(leaf)
  // 自販機（右の壁ぎわ）
  const vtex = canvasTex(128, 256, (x, w, h) => {
    x.fillStyle = '#d42f2f'; x.fillRect(0, 0, w, h); x.fillStyle = '#f7f7f7'; x.fillRect(8, 10, w - 16, 150)
    const cols = ['#1e88e5', '#43a047', '#fdd835', '#e53935', '#8e24aa', '#fb8c00']
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { x.fillStyle = cols[(r * 4 + c) % 6]; x.fillRect(14 + c * 26, 18 + r * 48, 18, 34); x.fillStyle = '#333'; x.fillRect(14 + c * 26, 54 + r * 48, 18, 4) }
    x.fillStyle = '#222'; x.fillRect(20, 200, 88, 30); x.fillStyle = '#fff'; x.font = '900 18px sans-serif'; x.fillText('DRINK', 30, 185)
  })
  vendMesh = new THREE.Group()
  box(0.7, 1.85, 0.75, lam(0xc62828), 0, 0.925, 0, vendMesh)
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.8), new THREE.MeshBasicMaterial({ map: vtex })); front.rotation.y = -Math.PI / 2; front.position.set(-0.36, 0.92, 0); vendMesh.add(front)
  vendMesh.position.set(1.32, 0, -4.6); hall.add(vendMesh)
  // 階数の札（エレベーター横）
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.18), new THREE.MeshBasicMaterial({ map: floorPlate })); plate.position.set(-1.2, 2.1, -0.6); plate.rotation.y = Math.PI / 2; hall.add(plate)
  // 乗り場の床の帯
  box(1.6, 0.01, 0.5, lam(0xc8b98f), 0, 0.005, -0.25, hall)
})()
drawPlate()

// ---------- 顔（Canvas に描いて板に貼る）
const FACE_CACHE = {}
function faceMat(expr, v) {
  const k = v + ':' + expr
  if (FACE_CACHE[k]) return FACE_CACHE[k]
  const tex = canvasTex(128, 128, (x) => drawFace(x, expr, v))
  return (FACE_CACHE[k] = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }))
}
function drawFace(x, e, v) {
  x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#1d1a24'; x.fillStyle = '#1d1a24'; x.lineWidth = 5
  const L = 44, R = 84, EY = 60, line = (a, b, c, d) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke() }
  const dot = (cx, cy, r) => { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill() }
  const big = (cx, cy, r, look = 0) => { x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#1d1a24'; dot(cx + look, cy + 1, r * 0.45) }
  const cheeks = (c = 'rgba(255,90,90,.45)') => { x.fillStyle = c; dot(32, 80, 9); dot(96, 80, 9); x.fillStyle = '#1d1a24' }
  if (v === 'old') { x.lineWidth = 2.5; line(30, 44, 42, 46); line(86, 46, 98, 44); line(50, 36, 78, 36); x.lineWidth = 5 }
  switch (e) {
    case 'calm': dot(L, EY, 5); dot(R, EY, 5); line(56, 92, 72, 92); break
    case 'run': line(L - 9, EY - 12, L + 7, EY - 6); line(R + 9, EY - 12, R - 7, EY - 6); dot(L, EY, 5.5); dot(R, EY, 5.5); x.beginPath(); x.ellipse(64, 92, 9, 7, 0, 0, 7); x.fill(); break
    case 'shout': line(L - 10, EY - 13, L + 7, EY - 7); line(R + 10, EY - 13, R - 7, EY - 7); dot(L, EY, 6); dot(R, EY, 6); x.beginPath(); x.ellipse(64, 94, 14, 13, 0, 0, 7); x.fill(); x.fillStyle = '#e86a6a'; x.beginPath(); x.ellipse(64, 100, 8, 5, 0, 0, 7); x.fill(); break
    case 'pant': line(L - 8, EY, L + 8, EY + 3); line(R + 8, EY, R - 8, EY + 3); x.beginPath(); x.ellipse(64, 95, 12, 11, 0, 0, 7); x.fill(); x.fillStyle = '#ff7a8a'; x.beginPath(); x.ellipse(64, 104, 7, 8, 0, 0, 7); x.fill(); cheeks('rgba(255,60,60,.6)'); x.fillStyle = '#7fd0ff'; dot(100, 40, 6); dot(26, 52, 5); break
    case 'despair':
      big(L, EY, 12, 0); big(R, EY, 12, 0); line(L - 12, EY - 20, L + 8, EY - 26); line(R + 12, EY - 20, R - 8, EY - 26)
      x.fillStyle = '#7fd0ff'; x.beginPath(); x.moveTo(L - 6, EY + 12); x.quadraticCurveTo(L - 12, EY + 34, L - 4, EY + 40); x.quadraticCurveTo(L + 4, EY + 30, L - 6, EY + 12); x.fill()
      x.beginPath(); x.moveTo(R + 6, EY + 12); x.quadraticCurveTo(R + 12, EY + 34, R + 4, EY + 40); x.quadraticCurveTo(R - 4, EY + 30, R + 6, EY + 12); x.fill()
      x.fillStyle = '#1d1a24'; x.beginPath(); x.moveTo(48, 104); x.quadraticCurveTo(56, 84, 64, 96); x.quadraticCurveTo(72, 84, 80, 104); x.closePath(); x.fill(); break
    case 'angry': line(L - 12, EY - 16, L + 8, EY - 6); line(R + 12, EY - 16, R - 8, EY - 6); dot(L, EY + 2, 5); dot(R, EY + 2, 5); x.fillStyle = '#fff'; x.fillRect(50, 88, 28, 12); x.strokeRect(50, 88, 28, 12); line(57, 88, 57, 100); line(64, 88, 64, 100); line(71, 88, 71, 100); x.strokeStyle = '#e53935'; x.lineWidth = 4; line(96, 30, 104, 38); line(104, 30, 96, 38); line(100, 28, 100, 40); break
    case 'glare': line(L - 10, EY - 4, L + 10, EY - 4); line(R - 10, EY - 4, R + 10, EY - 4); dot(L + 5, EY, 4); dot(R + 5, EY, 4); line(54, 94, 74, 90); break
    case 'happy': x.beginPath(); x.arc(L, EY + 4, 7, Math.PI, 0); x.stroke(); x.beginPath(); x.arc(R, EY + 4, 7, Math.PI, 0); x.stroke(); x.beginPath(); x.arc(64, 86, 12, 0.1, Math.PI - 0.1); x.stroke(); cheeks(); break
    case 'shame': line(L - 8, EY - 2, L + 8, EY + 2); line(R + 8, EY - 2, R - 8, EY + 2); x.beginPath(); x.moveTo(52, 94); x.quadraticCurveTo(58, 88, 64, 94); x.quadraticCurveTo(70, 100, 76, 94); x.stroke(); cheeks('rgba(255,60,60,.7)'); x.strokeStyle = '#3a6ff0'; x.lineWidth = 3; for (let i = 0; i < 4; i++) line(40 + i * 14, 24, 38 + i * 14, 38); break
    case 'strain': line(L - 9, EY - 4, L + 8, EY + 2); line(L - 9, EY + 6, L + 8, EY + 2); line(R + 9, EY - 4, R - 8, EY + 2); line(R + 9, EY + 6, R - 8, EY + 2); x.fillStyle = '#fff'; x.fillRect(48, 88, 32, 10); x.strokeRect(48, 88, 32, 10); x.fillStyle = '#7fd0ff'; dot(102, 46, 5); break
    case 'think': dot(L + 7, EY - 2, 5); dot(R + 7, EY - 2, 5); x.beginPath(); x.arc(70, 92, 6, 0, Math.PI); x.stroke(); break
    case 'smug': line(L - 10, EY - 2, L + 10, EY - 2); line(R - 10, EY - 2, R + 10, EY - 2); x.beginPath(); x.arc(64, 86, 12, 0.2, Math.PI - 0.2); x.stroke(); break
  }
  if (v === 'boss') {
    x.strokeStyle = '#1d1a24'; x.lineWidth = 3.5; x.strokeRect(L - 15, EY - 12, 30, 22); x.strokeRect(R - 15, EY - 12, 30, 22); line(L + 15, EY - 2, R - 15, EY - 2)
    x.fillStyle = '#3a2a20'; x.beginPath(); x.moveTo(40, 82); x.quadraticCurveTo(64, 70, 88, 82); x.quadraticCurveTo(64, 78, 40, 82); x.fill(); x.lineWidth = 7; x.strokeStyle = '#3a2a20'; line(L - 14, EY - 22, L + 12, EY - 18); line(R + 14, EY - 22, R - 12, EY - 18)
  }
  if (v === 'f') { x.lineWidth = 3; line(L - 9, EY - 7, L - 13, EY - 11); line(R + 9, EY - 7, R + 13, EY - 11); cheeks('rgba(255,120,140,.35)') }
}

// ---------- 人の組み立て
const GEO = {
  leg: new THREE.BoxGeometry(0.15, 0.74, 0.16).translate(0, -0.37, 0),
  arm: new THREE.BoxGeometry(0.11, 0.56, 0.12).translate(0, -0.26, 0),
  torso: new THREE.BoxGeometry(0.46, 0.6, 0.27),
  head: new THREE.SphereGeometry(0.2, 16, 12),
  cap: new THREE.SphereGeometry(0.212, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
  face: new THREE.PlaneGeometry(0.36, 0.36),
  hand: new THREE.SphereGeometry(0.055, 8, 6),
  belly: new THREE.SphereGeometry(0.25, 12, 10),
  coin: new THREE.CylinderGeometry(0.05, 0.05, 0.015, 12),
  cane: new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6),
  drop: new THREE.SphereGeometry(0.035, 6, 4),
}
const SKINS = [0xf2c9a0, 0xe8b48a, 0xd9a173]
const SUITS = [0x34495e, 0x4a4e69, 0x5b6c5d, 0x6d5d4b, 0x3d5a80, 0x55595f]
const SHIRTS = [0xffffff, 0xdfe9f5, 0xf5e6e8]
const TIES = [0x2e86de, 0x27ae60, 0x8e44ad, 0xf39c12, 0x16a085]
const HAIRS = [0x2b2118, 0x3b2a1e, 0x1a1a1a, 0x5a3b26]
function makePerson(type, look = {}) {
  const P = { type, g: new THREE.Group(), body: new THREE.Group(), ph: Math.random() * 6, face: null, fv: 'plain', expr: 'calm', headY: 0, legs: [], arms: [] }
  const r = Math.random
  const skin = type === 'sweaty' ? 0xf0957a : look.skin ?? SKINS[Math.floor(r() * 3)]
  const female = type === 'rider' ? r() < 0.45 : type === 'luggage' || type === 'normal' || type === 'feint' ? r() < 0.3 : false
  P.fv = type === 'boss' ? 'boss' : type === 'elderly' ? 'old' : female ? 'f' : 'plain'
  let suit = SUITS[Math.floor(r() * SUITS.length)], pants = 0x2c2f38, shirt = SHIRTS[Math.floor(r() * 3)]
  if (type === 'boss') { suit = 0x23243a; pants = 0x23243a }
  if (type === 'elderly') { suit = 0xc8a97e; pants = 0x6b5b4b }
  if (type === 'sweaty') { suit = 0xf4f4f4; pants = 0x3a4a6a }
  if (type === 'phone') suit = 0xd9488f
  if (type === 'luggage') suit = 0x5d8aa8
  if (female && type !== 'luggage') pants = suit
  P.g.add(P.body)
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(GEO.leg, lam(pants)); l.position.set(sx * 0.11, 0.78, 0); P.body.add(l); P.legs.push(l); const sh = box(0.15, 0.08, 0.24, lam(0x1d1d22), 0, -0.74, 0.04, l); void sh }
  const torso = new THREE.Mesh(GEO.torso, lam(suit)); torso.position.y = 1.08; P.body.add(torso)
  if (type === 'boss') { torso.scale.set(1.18, 1, 1.1); const b = new THREE.Mesh(GEO.belly, lam(suit)); b.scale.set(1.05, 0.95, 0.85); b.position.set(0, 1.0, 0.07); P.body.add(b) }
  if (type !== 'sweaty' && type !== 'elderly') {
    box(0.16, 0.26, 0.02, lam(shirt), 0, 1.24, type === 'boss' ? 0.17 : 0.14, P.body)
    if (!female || type === 'boss') box(0.06, 0.34, 0.02, lam(type === 'boss' ? 0xd62828 : type === 'phone' ? 0xffe14a : TIES[Math.floor(r() * TIES.length)]), 0, 1.15, type === 'boss' ? 0.185 : 0.155, P.body)
  }
  if (type === 'boss') box(0.05, 0.05, 0.02, basic(0xffd700), -0.15, 1.28, 0.19, P.body)
  if (type === 'sweaty') { box(0.5, 0.07, 0.32, lam(0xffffff), 0, 1.38, 0, P.body); box(0.12, 0.3, 0.03, lam(0xffffff), 0.12, 1.22, 0.15, P.body); for (const sx of [-1, 1]) box(0.12, 0.14, 0.02, lam(0xb7d3e8), sx * 0.13, 1.0, 0.14, P.body) }
  // 腕
  for (const sx of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(sx * 0.29, 1.34, 0); P.body.add(a); P.arms.push(a)
    const m = new THREE.Mesh(GEO.arm, lam(type === 'sweaty' ? skin : suit)); a.add(m)
    const h = new THREE.Mesh(GEO.hand, lam(skin)); h.position.y = -0.57; a.add(h)
  }
  // 頭
  const head = new THREE.Group(); head.position.y = 1.6; P.body.add(head); P.head = head
  head.add(new THREE.Mesh(GEO.head, lam(skin)))
  const face = new THREE.Mesh(GEO.face, faceMat('calm', P.fv)); face.position.set(0, -0.01, 0.2); face.renderOrder = 2; head.add(face); P.face = face
  const hairC = type === 'elderly' ? 0xdedede : HAIRS[Math.floor(r() * HAIRS.length)]
  if (type === 'boss') { for (const sx of [-1, 1]) box(0.06, 0.12, 0.2, lam(0x5a4a3a), sx * 0.19, 0.02, -0.02, head); box(0.24, 0.02, 0.18, lam(0x5a4a3a), 0.02, 0.2, 0, head).rotation.z = 0.15 }
  else {
    const cap = new THREE.Mesh(GEO.cap, lam(hairC)); cap.rotation.x = -0.35; cap.position.set(0, 0.02, -0.02); head.add(cap)
    if (female) box(0.38, 0.36, 0.14, lam(hairC), 0, -0.1, -0.12, head)
  }
  // 持ち物
  if (type === 'normal' && r() < 0.8) box(0.08, 0.26, 0.36, lam(0x4b3621), 0, -0.66, 0.04, P.arms[1])
  if (type === 'luggage') {
    const st = new THREE.Group(); st.position.set(0, 1.0, 0.36); P.body.add(st); P.boxes = st
    box(0.56, 0.22, 0.38, lam(0xc49a6c), 0, 0.0, 0, st); box(0.5, 0.2, 0.34, lam(0xb5895a), 0.03, 0.21, 0, st); box(0.44, 0.17, 0.3, lam(0xd4ab7c), -0.02, 0.4, 0, st)
    box(0.57, 0.03, 0.06, lam(0xd8c590), 0, 0.0, 0.17, st)
  }
  P.reach = type === 'luggage' ? 0.62 : type === 'boss' ? 0.36 : type === 'elderly' ? 0.4 : 0.3
  if (type === 'elderly') { P.body.rotation.x = 0.15; const c = new THREE.Mesh(GEO.cane, lam(0x6b4a2a)); c.position.set(0, -0.95, 0.1); P.arms[1].add(c) }
  if (type === 'phone') box(0.05, 0.13, 0.025, lam(0x111111), 0.0, -0.62, 0.07, P.arms[1])
  if (type === 'feint') { const c = new THREE.Mesh(GEO.coin, basic(0xffd23f)); c.rotation.x = Math.PI / 2; c.position.set(0, -0.63, 0.06); P.arms[1].add(c); P.coin = c }
  return P
}
function setFace(P, e) { if (P.expr === e) return; P.expr = e; P.face.material = faceMat(e, P.fv) }
// 走る・歩く・立つ のポーズ
function pose(P, mode, dt) {
  const L = P.legs, A = P.arms
  if (mode === 'run' || mode === 'walk' || mode === 'hobble') {
    const sp = mode === 'run' ? 13 : mode === 'hobble' ? 7 : 8, amp = mode === 'run' ? 0.85 : mode === 'hobble' ? 0.35 : 0.45
    P.ph += dt * sp
    const s = Math.sin(P.ph)
    L[0].rotation.x = s * amp; L[1].rotation.x = -s * amp
    P.body.position.y = Math.abs(Math.cos(P.ph)) * (mode === 'run' ? 0.06 : 0.025)
    A[0].rotation.x = -s * amp * 0.9; A[1].rotation.x = s * amp * 0.9; A[0].rotation.z = A[1].rotation.z = 0
  } else {
    L[0].rotation.x = lerp(L[0].rotation.x, 0, 0.2); L[1].rotation.x = lerp(L[1].rotation.x, 0, 0.2); P.body.position.y = lerp(P.body.position.y, 0, 0.2)
    A[0].rotation.x = lerp(A[0].rotation.x, 0, 0.2); A[1].rotation.x = lerp(A[1].rotation.x, 0, 0.2)
  }
  // 持ち方の上書き
  if (P.type === 'luggage') { A[0].rotation.x = A[1].rotation.x = -1.35; A[0].rotation.z = -0.25; A[1].rotation.z = 0.25 }
  if (P.type === 'phone') { A[1].rotation.x = -2.5; A[1].rotation.z = -0.6; if (mode === 'run') A[0].rotation.x = -1.2 + Math.sin(P.ph * 1.7) * 0.9 }
  if (P.type === 'feint' && mode !== 'vend') { A[1].rotation.x = -0.9 }
  if (P.type === 'elderly') { A[1].rotation.x = -0.2 + (mode === 'hobble' ? Math.sin(P.ph) * 0.2 : 0) }
  if (P.coin) P.coin.rotation.z += dt * 8
}

// ---------- 粒（汗）
const drops = []
for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(GEO.drop, basic(0x8fd3ff)); m.visible = false; scene.add(m); drops.push({ m, v: new THREE.Vector3(), life: 0 }) }
const _v = new THREE.Vector3()
function emitDrop(P) {
  const d = drops.find(d => d.life <= 0); if (!d) return
  P.head.getWorldPosition(_v); d.m.position.copy(_v).add(new THREE.Vector3((Math.random() - .5) * 0.3, 0.1, 0)); d.v.set((Math.random() - .5) * 1.6, 1 + Math.random(), (Math.random() - .5) * 0.8); d.life = 0.6; d.m.visible = true
}
function updateDrops(dt) { for (const d of drops) if (d.life > 0) { d.life -= dt; d.v.y -= 6 * dt; d.m.position.addScaledVector(d.v, dt); if (d.life <= 0) d.m.visible = false } }

// ---------- 吹き出し（DOM。3D の頭の上に出す）
const bubbleLayer = $('#bubbles'), bubbles = []
function say(P, text, cls = '', ttl = 1.6) {
  if (S.headless || !text) return
  let b = bubbles.find(b => b.P === P)
  // 車内の声は同時に2つまで（重なって読めなくなるので）
  if (!b && cls.startsWith('rider') && !cls.includes('angry') && bubbles.filter(x => x.el.className.includes('rider')).length >= 2) return
  if (!b) { const el = document.createElement('div'); bubbleLayer.appendChild(el); b = { el, P }; bubbles.push(b) }
  b.el.className = 'sb ' + cls; b.el.textContent = text; b.ttl = ttl; b.el.style.display = ''
}
function clearBubbles() { for (const b of bubbles) b.el.remove(); bubbles.length = 0 }
function updateBubbles(dt) {
  const W = innerWidth, H = innerHeight, top = 60
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.ttl -= dt
    const P = b.P, inHall = P.g.parent === hall
    if (b.ttl <= 0 || !P.g.parent) { b.el.remove(); bubbles.splice(i, 1); continue }
    const hidden = inHall && S.door < 0.12 && P.state !== 'blocked' && P.state !== 'glass'
    P.head.getWorldPosition(_v); _v.y += 0.36; _v.project(camera)
    if (hidden || _v.z > 1) { b.el.style.display = 'none'; continue }
    b.el.style.display = ''
    const w = b.el.offsetWidth, h = b.el.offsetHeight
    let x = (_v.x + 1) / 2 * W - w / 2, y = (1 - _v.y) / 2 * H - h - 8
    x = clamp(x, 8, W - w - 8); y = clamp(y, top, H - h - 160)
    b.el.style.transform = `translate(${x | 0}px,${y | 0}px)`
  }
}
function caption(text, good = false) {
  if (S.headless || S.demo) return
  const c = $('#caption'); c.textContent = text; c.className = good ? 'on good' : 'on'; clearTimeout(caption.tm); caption.tm = setTimeout(() => { c.className = good ? 'good' : '' }, 1200)
}
const sfx = (n, v) => { if (!S.demo && !S.headless) Snd.sfx(n, v) }

// ---------- 乗っている人
function addRider(P, slot) { P.slot = slot; P.g.position.set(SLOTS[slot][0], 0, SLOTS[slot][1]); P.g.rotation.y = Math.PI; car.add(P.g); S.riders.push(P) }
function freeSlot() { const used = new Set(S.riders.filter(r => r.state !== 'exit').map(r => r.slot)); for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) if (!used.has(i)) return i; return -1 }
const carCount = () => S.riders.filter(r => r.state !== 'exit').length

// ---------- 1回のゲーム
function resetGame(seed, demo) {
  for (const r of [...S.runners, ...S.riders]) r.g.parent && r.g.parent.remove(r.g)
  clearBubbles()
  Object.assign(S, { demo, seed, rng: mulberry(seed), t: 0, stopN: 0, floor: 2, door: 0, openOn: false, force: false, auto: false, irr: 12, raw: 0, maxRaw: 0, runners: [], riders: [], stop: null, ending: false, over: false, snapPri: 0, snapImg: null, snapWant: 0, deck: [], irrTalk: 1.5, flash: 0 })
  S.log = { in: {}, out: {}, buzz: 0, explode: 0, fooled: 0, bossOut: 0, nice: 0, people: 0, stops: 0, list: [] }
  for (let i = 0; i < 6; i++) { const P = makePerson('rider'); P.state = 'ride'; P.stay = 1 + Math.floor(S.rng() * 5); addRider(P, freeSlot()) }
  hall.position.y = 3.6
  newStop()
}
// 次の階に着く: 走ってくる人の予定を決める
function newStop() {
  for (const r of S.runners) r.g.parent && r.g.parent.remove(r.g)
  S.runners = []
  S.stopN++; S.floor++; drawFloor(true); drawPlate()
  const t = S.t, rng = S.rng
  let n = t < 7 ? 1 : t < 20 ? (rng() < 0.7 ? 2 : 1) : t < 40 ? 2 + (rng() < 0.5 ? 1 : 0) : 3 + (rng() < 0.3 ? 1 : 0)
  // 最初の4回は種類を見せる。以降は重みで選ぶ
  const W = { boss: 14, luggage: 12, elderly: 10, normal: 16, sweaty: 15, phone: 14, feint: 19 }
  const list = []
  for (let i = 0; i < n; i++) {
    let ty
    if (S.stopN <= 4 && i === 0) { if (!S.deck.length) S.deck = ['boss', 'sweaty', 'elderly', 'phone'].sort(() => rng() - 0.5); ty = S.deck.pop() }
    else { let sum = 0; for (const k in W) sum += W[k]; let q = rng() * sum; for (const k in W) { q -= W[k]; if (q <= 0) { ty = k; break } } ty = ty || 'normal' }
    list.push(ty)
  }
  const lv = clamp(t / GAME_T, 0, 1)
  let delay = 0.2 + rng() * 0.4
  for (const ty of list) {
    const P = makePerson(ty)
    const base = TYPES[ty].speed * (1 + 0.22 * lv) * (0.92 + rng() * 0.16)
    const d0 = ty === 'elderly' ? 5.5 + rng() * 3 : ty === 'luggage' ? 8 + rng() * 5 : 10 + rng() * 8
    Object.assign(P, { state: 'wait', spawnAt: delay, speed: base, x: (rng() - 0.5) * 1.6, z: -d0, tx: (rng() < 0.5 ? -1 : 1) * (0.12 + rng() * 0.1), res: null, swerveD: 5.4 + rng() * 1.2, talk: 0.3 + rng() * 0.5, seenAt: null, perc: null })
    S.runners.push(P)
    delay += 0.35 + rng() * 1.2 * (1 - lv * 0.4)
  }
  // 降りる人
  const cnt = carCount()
  const exitN = cnt >= 7 ? Math.floor(rng() * 2.3) : cnt >= 5 ? (rng() < 0.4 ? 1 : 0) : rng() < 0.2 ? 1 : 0
  let k = 0
  for (const r of S.riders) { r.stay--; }
  const cand = S.riders.filter(r => r.state === 'ride').sort((a, b) => a.stay - b.stay)
  for (const r of cand) { if (k >= exitN && r.stay > 0) break; if (k >= 3) break; r.state = 'exitWait'; r.exitAt = 0.15 + k * 0.35; k++ }
  S.stop = { ph: 'arrive', t: 0, pt: 0, dead: 0, buzzT: 0, any: S.runners.length > 0, closedAt: 0, snapAt: 0 }
  S.hintType = S.tut && S.stopN <= 5 && S.runners.length ? S.runners[0].type : null
  S.openOn = false; S.force = false; S.auto = false
  S.log.stops++
}

// 結果の記録。oc = in / out / buzz / fooled / dodged / none
function resolve(P, oc) {
  if (P.res) return
  P.res = oc
  if (oc === 'none') return
  const ty = TYPES[P.type]; let pt = 0, best = 0
  if (P.type === 'feint') { best = 4; pt = oc === 'fooled' ? -6 : 4; if (oc === 'fooled') S.log.fooled++ }
  else if (oc === 'in') {
    // 後ろから乗せるべき人が来ていて開けて待っていた時は、しかたない（軽い減点）
    const excused = !ty.good && S.runners.some(r => r !== P && TYPES[r.type].good && r.type !== 'normal' && !r.res && (r.state === 'run' || r.state === 'blocked'))
    if (excused) { pt = -3; best = -3 } else { pt = ty.pt[0]; best = ty.good ? ty.pt[0] : ty.pt[1] }
  }
  else if (oc === 'out') {
    if (ty.good && carCount() >= CAP) { pt = P.type === 'boss' ? -5 : 0; best = 0 }
    else { pt = ty.pt[1]; best = ty.good ? ty.pt[0] : ty.pt[1] }
  } else if (oc === 'buzz') { pt = -8; best = ty.good ? 0 : ty.pt[1]; S.log.buzz++ }
  S.raw += pt; S.maxRaw += best; S.log.people++
  const key = oc === 'in' ? 'in' : (oc === 'out' || oc === 'buzz') ? 'out' : null
  if (key) S.log[key][P.type] = (S.log[key][P.type] || 0) + 1
  if (P.type === 'boss' && (oc === 'out' || oc === 'buzz')) S.log.bossOut++
  S.log.list.push([P.type, oc])
}

// ---------- 操作
function setOpen(v) {
  const st = S.stop; if (!st || S.phase !== 'play' && !S.demo || !(st.ph === 'open' || st.ph === 'opening')) return false
  if (v === undefined) v = !S.openOn
  S.openOn = v; if (v) { S.force = false; S.auto = false }
  return true
}
function pressClose() {
  const st = S.stop; if (!st || S.phase !== 'play' && !S.demo || !(st.ph === 'open' || st.ph === 'opening')) return false
  S.openOn = false; S.force = true; return true
}

// ---------- 1ステップ（固定60Hz）
function update(dt) {
  if (S.phase === 'count') { S.cd -= dt; countTick(); return }
  if (S.phase !== 'play' && S.phase !== 'title') return
  if (S.bot) botThink()
  const st = S.stop
  if (S.phase === 'play' && !S.over) { S.t += dt; if (S.t >= GAME_T && !S.ending) { S.ending = true; S.openOn = false; S.force = true } }
  st.t += dt
  // ---- 階の移動と扉
  if (st.ph === 'arrive') {
    hall.position.y = lerp(3.6, 0, ease(clamp(st.t / 0.42, 0, 1)))
    if (st.t >= 0.42) { st.ph = 'opening'; st.t = 0; hall.position.y = 0; sfx('ding'); sfx('door', 0.6); drawFloor(false) }
  } else if (st.ph === 'depart') {
    hall.position.y = lerp(0, -3.6, ease(clamp(st.t / 0.42, 0, 1)))
    if (st.t >= 0.42) {
      if (S.ending) return finish()
      newStop()
    }
  } else if (st.ph === 'closed') {
    if (st.t >= 0.55) { st.ph = 'depart'; st.t = 0 }
  }
  if (st.ph === 'opening' || st.ph === 'open') {
    st.pt += dt
    if (st.ph === 'opening' && st.pt > 0.45) st.ph = 'open'
    // 扉にいる人がいたら閉まらない
    const inDoor = S.runners.some(r => (r.state === 'board' || r.state === 'buzzin' || r.state === 'buzzout') && r.z < 0.25 && r.z > -0.6) || S.riders.some(r => r.state === 'exit' && r.g.position.z < 0.4 && r.g.position.z > -0.7)
    const near = S.runners.some(r => r.state === 'run' && r.z > -1.4)
    if (S.ending && st.pt > 1.6) { S.force = true; S.openOn = false }
    if (st.buzzT > 0) { st.buzzT -= dt; S.door = Math.min(1, S.door + DOOR_OPEN_V * dt) }
    else if (S.openOn) { S.door = Math.min(1, S.door + DOOR_OPEN_V * dt); S.auto = false }
    else if (S.force) { S.door = Math.max(inDoor ? 0.55 : 0, S.door - DOOR_FORCE_V * dt) }
    else {
      if (!S.auto && st.ph === 'open' && st.pt > AUTO_T && !near && !inDoor) S.auto = true
      if (S.auto && (inDoor || near)) { S.auto = false } // センサーで開き直す
      if (S.auto) S.door = Math.max(0, S.door - DOOR_AUTO_V * dt)
      else S.door = Math.min(1, S.door + DOOR_OPEN_V * dt)
    }
    if (st.ph === 'open' && S.door <= 0) closeStop()
    // 空気: 待たされるほどイライラ
    if (st.ph === 'open' && S.door > 0.3 && st.pt > GRACE) {
      const pend = S.runners.filter(r => r.state === 'wait' && st.pt >= r.spawnAt - 0.01 || r.state === 'run' || r.state === 'blocked')
      const goodPend = pend.some(r => TYPES[r.type].good)
      // 見れば分かる状況で待たせた時間（スッと閉めたかの判定）
      if (!goodPend && !pend.some(r => r.state === 'wait' || -r.z > 12)) st.dead += dt
      let rate = goodPend ? 3 : pend.length ? 8 : S.openOn ? 22 : 6
      if (S.riders.some(r => r.type === 'boss' && r.state === 'ride')) rate *= 0.7
      addIrr(rate * dt)
    }
  }
  // 乗っている困った人
  for (const r of S.riders) if (r.state === 'ride') {
    if (r.type === 'phone') { addIrr(1.8 * dt); r.talk -= dt; if (r.talk <= 0) { r.talk = 1.6 + Math.random() * 1.5; say(r, pick(D.LINES[S.lang].phone), 'loud', 1.3); sfx('phone') } }
    if (r.type === 'sweaty') { addIrr(1.3 * dt); if (Math.random() < dt * 2) emitDrop(r) }
  }
  if (st.ph === 'depart' || st.ph === 'arrive') S.irr = Math.max(0, S.irr - 7 * dt)
  updateRunners(dt)
  updateRiders(dt)
  // 車内の反応
  S.irrTalk -= dt
  if (S.irrTalk <= 0 && S.irr > 32 && (st.ph === 'open') && S.riders.length) {
    S.irrTalk = lerp(2.4, 0.7, clamp((S.irr - 32) / 60, 0, 1)) * (0.7 + Math.random() * 0.6)
    const P = pick(S.riders.filter(r => r.state === 'ride' && r.type === 'rider') .concat([]))
    if (P) { const line = pick(D.RIDER[S.lang].wait); say(P, line, S.irr > 75 ? 'rider angry' : 'rider', 1.4); sfx(Math.random() < 0.6 ? 'tsk' : 'sigh'); if (line.includes('時計') || line.includes('watch')) P.watch = 1.2 }
  }
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt)
  if (S.flash > 0) S.flash = Math.max(0, S.flash - dt)
}
function addIrr(v) {
  S.irr += v
  if (S.irr >= 100) {
    S.irr = 40; S.log.explode++; S.raw -= 12
    caption(T('explodeCap')); sfx('boom'); S.shake = 0.6; S.flash = 0.5
    for (const r of S.riders) if (r.state === 'ride' && r.type === 'rider') { say(r, pick(D.RIDER[S.lang].explode), 'rider angry', 1.6); r.rage = 1.6 }
  }
}
function closeStop() {
  const st = S.stop
  S.hintType = null
  st.ph = 'closed'; st.t = 0; sfx('thud')
  for (const P of S.runners) {
    if (P.state === 'wait') {
      if (st.pt >= P.spawnAt) { P.state = 'run'; spawn(P) } else { resolve(P, 'none'); continue }
    }
    if (P.state === 'run' || P.state === 'blocked') {
      if (P.type === 'feint') { resolve(P, 'dodged'); continue }
      resolve(P, 'out')
      const dist = -P.z
      if (dist < 6) { P.state = 'toGlass' } else { P.state = 'slump'; setFace(P, 'despair') }
      if (P.type === 'boss') { caption(T('bossCap')); sfx('boss'); for (const r of S.riders) if (r.state === 'ride' && r.type === 'rider' && Math.random() < 0.5) say(r, pick(D.RIDER[S.lang].bossOut), 'rider', 1.8) }
      else if (dist < 6) setTimeout(() => sfx('despair'), 250)
      want(P.type === 'boss' ? 3 : TYPES[P.type].good ? 2 : 1, 0.55)
    }
  }
  // スッと閉めたか
  if (st.any) {
    S.maxRaw += 2
    if (st.dead < SNAP_T) { S.raw += 2; S.log.nice++; S.irr = Math.max(0, S.irr - 5); if (!S.runners.some(r => r.res === 'out' && TYPES[r.type].good)) { caption(T('niceCap'), true); sfx('nice') } }
    else S.raw -= Math.min(6, (st.dead - SNAP_T) * 1.2)
  }
  S.openOn = false; S.force = false; S.auto = false
}
function want(pri, delay) { if (pri > S.snapPri) { S.snapWant = pri; S.snapAt = performance.now() + delay * 1000 } }
function spawn(P) {
  P.g.position.set(P.x, 0, P.z); P.g.rotation.y = 0; hall.add(P.g)
  setFace(P, { boss: 'shout', luggage: 'strain', elderly: 'calm', normal: 'run', sweaty: 'pant', phone: 'shout', feint: 'think' }[P.type])
}
function updateRunners(dt) {
  const st = S.stop
  for (const P of S.runners) {
    switch (P.state) {
      case 'wait':
        if ((st.ph === 'open' || st.ph === 'opening') && st.pt >= P.spawnAt) { P.state = 'run'; spawn(P) }
        break
      case 'run': {
        const dist = -P.z
        P.x = lerp(P.x, P.tx, clamp(dt * 1.2 * (6 / Math.max(dist, 1.5)), 0, 1))
        P.z += P.speed * dt
        pose(P, P.type === 'elderly' ? 'hobble' : 'run', dt)
        P.talk -= dt
        if (dist < 14 && P.talk <= 0) {
          P.talk = 1.4 + Math.random()
          const cls = P.type === 'feint' ? 'think' : P.type === 'phone' ? 'loud' : ''
          say(P, pick(D.LINES[S.lang][P.type]), cls, 1.2)
          if (P.type === 'boss') sfx('oi'); else if (P.type === 'sweaty') sfx('pant'); else if (P.type === 'phone') sfx('phone')
        }
        if (P.type === 'sweaty' && Math.random() < dt * 8) emitDrop(P)
        if (P.type === 'feint' && dist < P.swerveD) {
          P.state = 'swerve'
          const goodPend = S.runners.some(r => r !== P && TYPES[r.type].good && (r.state === 'run' || r.state === 'wait' && st.pt >= r.spawnAt))
          if (S.openOn && !goodPend && st.ph === 'open') { resolve(P, 'fooled'); caption(T('fooledCap')); addIrr(10); for (const r of S.riders) if (r.state === 'ride' && Math.random() < 0.4) say(r, '……', 'rider', 1.2) } else resolve(P, 'dodged')
        }
        if (P.z >= -(P.reach + 0.12)) arrive(P)
        break
      }
      case 'blocked':
        pose(P, 'stand', dt)
        if ((st.ph === 'open' || st.ph === 'opening') && S.door >= 0.5) board(P)
        break
      case 'buzzin': case 'buzzout': {
        const [tx, tz] = P.target, dx = tx - P.g.position.x, dz = tz - P.g.position.z, d = Math.hypot(dx, dz), sp = 2.4 * dt
        if (d > 0.02) { P.g.position.x += dx / d * Math.min(sp, d); P.g.position.z += dz / d * Math.min(sp, d); P.g.rotation.y = Math.atan2(dx, dz); pose(P, 'walk', dt) }
        P.z = P.g.position.z
        if (P.z > 0.05 && P.g.parent === hall) { hall.remove(P.g); car.add(P.g) }
        if (d <= 0.02) {
          if (P.state === 'buzzin') { P.state = 'buzzout'; P.target = [P.tx * 2, -0.75] }
          else if (P.state === 'buzzout') { P.state = 'shame'; P.g.rotation.y = 0; if (P.g.parent === car) { car.remove(P.g); hall.add(P.g) } }
        }
        break
      }
      case 'swerve': {
        const tx = 0.82, tz = -4.6, dx = tx - P.g.position.x, dz = tz - P.g.position.z, d = Math.hypot(dx, dz)
        if (d > 0.05) { P.g.position.x += dx / d * Math.min(P.speed * 0.7 * dt, d); P.g.position.z += dz / d * Math.min(P.speed * 0.7 * dt, d); P.g.rotation.y = Math.atan2(dx, dz); pose(P, 'run', dt) }
        else { P.state = 'vend'; P.g.rotation.y = Math.PI / 2; P.vt = 0; setFace(P, 'happy') }
        P.z = P.g.position.z; break
      }
      case 'vend':
        P.vt += dt; pose(P, 'vend', dt); P.arms[1].rotation.x = -1.3 + Math.sin(P.vt * 10) * 0.1
        if (P.vt > 0.6 && !P.vended) { P.vended = true; say(P, pick(D.LINES[S.lang].vend), 'think', 1.4); sfx('clunk') }
        break
      case 'toGlass': {
        const tx = P.g.position.x < 0 ? -0.2 : 0.2, tz = -(P.reach + 0.08)
        const dx = tx - P.g.position.x, dz = tz - P.g.position.z, d = Math.hypot(dx, dz)
        if (d > 0.03) { P.g.position.x += dx / d * Math.min(P.speed * dt, d); P.g.position.z += dz / d * Math.min(P.speed * dt, d); P.g.rotation.y = 0; pose(P, 'run', dt) }
        else { P.state = 'glass'; P.gt = 0; setFace(P, P.type === 'boss' ? 'angry' : 'despair'); say(P, D.DESPAIR[S.lang][P.type], P.type === 'boss' ? 'angry' : '', 2.2) }
        break
      }
      case 'glass':
        P.gt += dt; pose(P, 'stand', dt)
        P.arms[0].rotation.x = P.arms[1].rotation.x = P.type === 'luggage' ? -1.35 : -2.65; P.arms[0].rotation.z = -0.3; P.arms[1].rotation.z = 0.3
        if (P.type === 'elderly' || P.type === 'normal') { P.arms[1].rotation.x = 0; P.arms[1].rotation.z = 0 } // 杖・かばんの手は下ろしたまま
        // 顔をガラスに押しつける（ドアを突き抜けない所まで）
        const hz = P.type === 'luggage' ? 0.05 : P.reach - 0.24
        P.head.position.z = Math.min(hz, P.gt * 0.5); P.head.scale.z = 1 - Math.min(0.3, P.gt * 0.7); if (P.type === 'elderly') P.body.rotation.x = 0.05
        break
      case 'slump':
        pose(P, 'stand', dt); P.body.rotation.x = lerp(P.body.rotation.x, 0.6, 0.1); P.arms[0].rotation.x = P.arms[1].rotation.x = -0.5
        break
      case 'shame':
        pose(P, 'stand', dt); P.head.rotation.x = lerp(P.head.rotation.x, 0.4, 0.1)
        break
    }
    if (P.state !== 'wait' && P.state !== 'board' && P.state !== 'buzzin' && P.state !== 'buzzout' && P.state !== 'swerve' && P.state !== 'toGlass' && P.state !== 'vend' && P.state !== 'ride') P.g.position.set(P.state === 'run' ? P.x : P.g.position.x, 0, P.state === 'run' ? P.z : P.g.position.z)
  }
}
// 扉の前に着いた
function arrive(P) {
  const st = S.stop
  const canOpen = (st.ph === 'open' || st.ph === 'opening')
  if (canOpen && (S.door >= 0.5 || (S.door > 0.05 && S.auto))) { S.auto = false; board(P) }
  else { P.state = 'blocked'; P.z = -(P.reach + 0.12); P.g.position.z = P.z; setFace(P, 'despair') }
}
function board(P) {
  if (carCount() >= CAP) {
    P.state = 'buzzin'; P.target = [P.tx, 0.35]; resolve(P, 'buzz'); setFace(P, 'shame'); S.stop.buzzT = 1.5
    sfx('buzz'); caption(T('buzzCap')); addIrr(22); S.shake = 0.4
    for (const r of S.riders) if (r.state === 'ride' && Math.random() < 0.6) say(r, pick(D.RIDER[S.lang].buzz), 'rider', 1.5)
    want(1, 0.3)
    return
  }
  const slot = freeSlot()
  P.slot = slot; P.state = 'board'; P.target = [SLOTS[slot][0], SLOTS[slot][1]]; P.g.position.z = P.z
  // 乗ったら車内の人数に入る（場所は歩きながら取る）
  S.riders.push(P); P.state = 'board'
  resolve(P, 'in')
  const L = D.RIDER[S.lang]
  if (P.type === 'sweaty') { addIrr(18); sfx('gasp'); for (const r of S.riders) if (r !== P && r.state === 'ride' && Math.random() < 0.5) say(r, pick(L.sweaty), 'rider', 1.4) }
  if (P.type === 'phone') { addIrr(18); for (const r of S.riders) if (r !== P && r.state === 'ride' && Math.random() < 0.5) say(r, pick(L.phone), 'rider', 1.4) }
  if (P.type === 'boss') { for (const r of S.riders) if (r !== P && r.state === 'ride' && Math.random() < 0.6) { say(r, pick(L.boss), 'rider', 1.4); r.bow = 0.8 } }
  if (P.type === 'elderly') { const r = S.riders.find(r => r !== P && r.state === 'ride'); if (r) say(r, pick(L.elderly), 'rider', 1.4) }
}
function updateRiders(dt) {
  const st = S.stop
  for (let i = S.riders.length - 1; i >= 0; i--) {
    const P = S.riders[i]
    if (P.state === 'board') { // 歩いて場所へ（updateRunners と同じ動き）
      const [tx, tz] = P.target, dx = tx - P.g.position.x, dz = tz - P.g.position.z, d = Math.hypot(dx, dz), sp = 2.4 * dt
      if (d > 0.02) { P.g.position.x += dx / d * Math.min(sp, d); P.g.position.z += dz / d * Math.min(sp, d); P.g.rotation.y = Math.atan2(dx, dz); pose(P, 'walk', dt) }
      if (P.g.position.z > 0.05 && P.g.parent === hall) { hall.remove(P.g); car.add(P.g) }
      P.z = P.g.position.z
      if (d <= 0.02) { P.state = 'ride'; P.g.rotation.y = Math.PI; setFace(P, P.type === 'boss' ? 'smug' : P.type === 'sweaty' ? 'pant' : P.type === 'phone' ? 'shout' : 'happy'); P.stay = 2 + Math.floor(S.rng() * 3); P.talk = 1; S.runners = S.runners.filter(r => r !== P) }
      continue
    }
    if (P.state === 'exitWait' && (st.ph === 'open' || st.ph === 'opening') && st.pt >= P.exitAt) { P.state = 'exit'; P.path = [[P.g.position.x * 0.3, 0.3], [0, -0.7], [P.g.position.x < 0 ? -1.3 : 1.3, -1.6]]; setFace(P, 'calm') }
    if (P.state === 'exit') {
      const [tx, tz] = P.path[0], dx = tx - P.g.position.x, dz = tz - P.g.position.z, d = Math.hypot(dx, dz), sp = 2.6 * dt
      if (d > 0.03) { P.g.position.x += dx / d * Math.min(sp, d); P.g.position.z += dz / d * Math.min(sp, d); P.g.rotation.y = Math.atan2(dx, dz); pose(P, 'walk', dt) }
      else { P.path.shift(); if (P.g.position.z < -0.05 && P.g.parent === car) { car.remove(P.g); hall.add(P.g) } if (!P.path.length) { P.g.parent && P.g.parent.remove(P.g); S.riders.splice(i, 1) } }
      continue
    }
    if (P.state === 'ride' || P.state === 'exitWait') {
      pose(P, 'stand', dt)
      // イライラの見た目: 振り向いてにらむ・時計を見る・足トントン
      const ang = P.rage > 0 ? 1 : S.irr > 62 ? 0.8 : 0
      if (P.rage > 0) P.rage -= dt
      const sideTurn = (P.g.position.x < 0 ? -1 : 1) * 2.0 * ang
      P.head.rotation.y = lerp(P.head.rotation.y, P.type === 'rider' ? sideTurn : 0, 0.08)
      if (P.type === 'rider') setFace(P, P.rage > 0 ? 'angry' : S.irr > 62 ? 'glare' : S.irr > 35 ? 'calm' : 'calm')
      if (P.watch > 0) { P.watch -= dt; P.arms[0].rotation.x = -1.4; P.arms[0].rotation.z = 0.6; P.head.rotation.x = 0.35 } else { P.arms[0].rotation.z = lerp(P.arms[0].rotation.z, 0, 0.2); P.head.rotation.x = lerp(P.head.rotation.x, 0, 0.1) }
      if (S.irr > 45 && P.type === 'rider') P.legs[0].rotation.x = Math.max(0, Math.sin(performance.now() / 90 + P.ph)) * -0.25
      if (P.bow > 0) { P.bow -= dt; P.body.rotation.x = Math.sin((0.8 - P.bow) / 0.8 * Math.PI) * 0.45 } else if (P.type !== 'elderly') P.body.rotation.x = 0
      if (P.type === 'phone' && P.state === 'ride') { P.arms[1].rotation.x = -2.5; P.arms[1].rotation.z = -0.6 }
    }
  }
}

// ---------- ボット（検証とタイトル画面の見本）
const BOTS = {
  good: { recog: 16, react: 0.3, err: 0.04, cap: true, hold: true },
  normal: { recog: 11, react: 0.55, err: 0.14, cap: false, hold: false },
  sloppy: { recog: 7, react: 0.9, err: 0.3, cap: false, hold: false },
  none: null,
}
function setBot(name, seed = 7) { const b = BOTS[name]; S.bot = b ? { ...b, name, rng: mulberry(seed), cur: 'idle', chgAt: 0, want: 'idle' } : null }
function botThink() {
  const b = S.bot, st = S.stop
  if (!(st.ph === 'open' || st.ph === 'opening')) { b.cur = 'idle'; b.want = 'idle'; return }
  let wantOpen = false, unknown = false
  const cnt = carCount() + S.runners.filter(r => r.state === 'board').length * 0
  for (const r of S.runners) {
    if (r.res || !(r.state === 'run' || r.state === 'blocked')) { if (r.state === 'wait' && st.pt >= r.spawnAt - 0.3) unknown = true; continue }
    const dist = -r.z, f = r.type === 'feint' ? 0.6 : r.type === 'normal' ? 0.8 : 1
    if (r.seenAt == null && dist <= b.recog * f) { r.seenAt = st.pt; const g = TYPES[r.type].good; r.perc = b.rng() < b.err ? !g : g }
    if (r.seenAt == null || st.pt - r.seenAt < b.react) { unknown = true; continue }
    if (r.perc) wantOpen = true
  }
  if (wantOpen && b.cap && cnt >= CAP) wantOpen = false
  const w = wantOpen ? 'open' : unknown ? (b.hold ? 'open' : 'idle') : 'close'
  if (w !== b.want) { b.want = w; b.chgAt = st.pt + (b.cur === 'idle' && w !== 'close' ? 0 : b.react * 0.6) }
  if (b.want !== b.cur && st.pt >= b.chgAt) {
    b.cur = b.want
    if (b.cur === 'open') setOpen(true)
    else if (b.cur === 'close') pressClose()
    else if (S.openOn) setOpen(false)
  }
  if (b.cur === 'open' && !S.openOn && !S.force) setOpen(true)
}

// ---------- 描画
function fitCamera() {
  const w = innerWidth, h = innerHeight, a = w / h
  renderer.setSize(w, h, false)
  camera.aspect = a
  const half = 21 * Math.PI / 180
  camera.fov = clamp(2 * Math.atan(Math.tan(half) / a) * 180 / Math.PI, 50, 82)
  // 縦持ちは下にボタンがあるので、絵を少し上に寄せる
  if (a < 1) camera.setViewOffset(w, h * 1.14, 0, h * 0.14, w, h); else camera.clearViewOffset()
  camera.updateProjectionMatrix()
}
function render() {
  placeDoors()
  camera.position.copy(CAM)
  if (S.stop && (S.stop.ph === 'depart' || S.stop.ph === 'arrive')) camera.position.y += Math.sin(performance.now() / 30) * 0.004
  if (S.shake > 0) { camera.position.x += (Math.random() - .5) * S.shake * 0.08; camera.position.y += (Math.random() - .5) * S.shake * 0.05 }
  camera.lookAt(CAM_T)
  renderer.render(scene, camera)
  if (S.snapWant && performance.now() >= S.snapAt && S.phase === 'play') {
    try { S.snapImg = canvas.toDataURL('image/jpeg', 0.82); S.snapPri = S.snapWant } catch (e) {}
    S.snapWant = 0
  }
}

// ---------- HUD
const capIcons = $('#capIcons'); for (let i = 0; i < CAP; i++) capIcons.appendChild(document.createElement('i'))
let hudCache = ''
function updateHUD() {
  // 手引き（最初のゲームの最初の5回。人が見えてから出す）
  const ht = S.hintType && S.stop && S.stop.ph === 'open' && S.runners.some(r => r.type === S.hintType && r.state === 'run') ? S.hintType : null
  if (($('#hint').dataset.ty || '') !== (ht || '')) {
    $('#hint').dataset.ty = ht || ''; $('#hint').hidden = !ht
    if (ht) { $('#hint .ic').innerHTML = headSvg(ht); $('#hint .tx').textContent = D.HINT[S.lang][ht] }
  }
  const left = Math.max(0, Math.ceil(GAME_T - S.t)), cnt = carCount()
  const key = left + '|' + cnt + '|' + Math.round(S.irr) + '|' + S.openOn + '|' + S.flash.toFixed(1)
  if (key === hudCache) return; hudCache = key
  $('#tLeft').textContent = left
  $('#chipTime').classList.toggle('hurry', left <= 10 && S.phase === 'play')
  ;[...capIcons.children].forEach((el, i) => el.classList.toggle('on', i < cnt))
  $('#chipCap').classList.toggle('full', cnt >= CAP)
  $('#irrBar i').style.width = clamp(S.irr, 0, 100) + '%'
  $('#irrBar i').style.backgroundPosition = -clamp(S.irr, 0, 100) * 2 + 'px 0'
  const lv = S.irr > 70 ? 2 : S.irr > 38 ? 1 : 0
  if ($('#irrFace').dataset.lv !== String(lv)) { $('#irrFace').dataset.lv = lv; $('#irrFace').innerHTML = irrFaceSvg(lv) }
  $('#bOpen').classList.toggle('on', S.openOn)
  $('#flash').style.opacity = S.flash > 0 ? Math.min(0.35, S.flash) : 0
}

// ---------- SVG の絵
function irrFaceSvg(lv) {
  const c = ['#7ad37a', '#f5c84c', '#ff4a4a'][lv]
  const m = ['<path d="M9 17q4 3 8 0" stroke="#1d1a24" stroke-width="2" fill="none"/>', '<path d="M9 17h8" stroke="#1d1a24" stroke-width="2"/>', '<path d="M8 18q5-4 10 0" stroke="#1d1a24" stroke-width="2" fill="none"/><path d="M6 7l5 2M20 7l-5 2" stroke="#1d1a24" stroke-width="2"/>'][lv]
  return `<svg viewBox="0 0 26 26"><circle cx="13" cy="13" r="12" fill="${c}"/><circle cx="9" cy="11" r="1.8" fill="#1d1a24"/><circle cx="17" cy="11" r="1.8" fill="#1d1a24"/>${m}</svg>`
}
function headSvg(type, expr = 'calm') {
  const skin = type === 'sweaty' ? '#f0957a' : '#f2c9a0'
  let hair = '<path d="M7 18a13 12 0 0 1 26 0q-6-6-13-5t-13 5z" fill="#2b2118"/>', extra = '', eyes = '<circle cx="15" cy="21" r="1.8"/><circle cx="25" cy="21" r="1.8"/>', mouth = '<path d="M16 28h8" stroke-width="2"/>', body = '#4a4e69'
  if (type === 'boss') { hair = '<rect x="5" y="17" width="3" height="6" fill="#5a4a3a"/><rect x="32" y="17" width="3" height="6" fill="#5a4a3a"/><path d="M13 9q8-3 14 1" stroke="#5a4a3a" stroke-width="2" fill="none"/>'; extra = '<rect x="11" y="18" width="8" height="6" fill="none" stroke-width="1.5"/><rect x="21" y="18" width="8" height="6" fill="none" stroke-width="1.5"/><path d="M13 27q7-3 14 0q-7-1-14 0z" fill="#3a2a20"/>'; body = '#23243a'; mouth = '' }
  if (type === 'elderly') { hair = '<path d="M7 18a13 12 0 0 1 26 0q-6-4-13-4t-13 4z" fill="#dcdcdc"/>'; eyes = '<path d="M13 21q2-2 4 0M23 21q2-2 4 0" fill="none" stroke-width="1.6"/>'; body = '#c8a97e' }
  if (type === 'sweaty') { body = '#f4f4f4'; mouth = '<ellipse cx="20" cy="29" rx="3" ry="3"/>'; extra = '<path d="M33 12q2 3 0 5q-2-2 0-5z" fill="#7fd0ff"/><path d="M6 20q2 3 0 5q-2-2 0-5z" fill="#7fd0ff"/>' }
  if (type === 'phone') { body = '#d9488f'; mouth = '<ellipse cx="20" cy="29" rx="3.5" ry="3"/>'; extra = '<rect x="31" y="15" width="4" height="10" rx="1" fill="#111"/><path d="M36 10l3-3M37 14h4" stroke="#e5383b" stroke-width="2"/>' }
  if (type === 'luggage') { body = '#5d8aa8'; extra = '<rect x="6" y="32" width="28" height="8" fill="#c49a6c" stroke-width="1.5"/>' }
  if (type === 'feint') { eyes = '<circle cx="17" cy="20" r="1.8"/><circle cx="27" cy="20" r="1.8"/>'; extra = '<circle cx="34" cy="31" r="4" fill="#ffd23f" stroke-width="1.5"/>' }
  if (type === 'normal') extra = '<rect x="28" y="31" width="9" height="7" rx="1" fill="#4b3621"/>'
  if (expr === 'despair') { eyes = '<circle cx="15" cy="21" r="3.5" fill="#fff"/><circle cx="25" cy="21" r="3.5" fill="#fff"/><circle cx="15" cy="21" r="1.4"/><circle cx="25" cy="21" r="1.4"/>'; mouth = '<path d="M15 31q2.5-5 5-1q2.5-4 5 1z"/>' }
  if (expr === 'angry') { eyes = '<path d="M12 17l6 3M28 17l-6 3"/><circle cx="15" cy="22" r="1.6"/><circle cx="25" cy="22" r="1.6"/>'; mouth = '<rect x="15" y="27" width="10" height="4" fill="#fff" stroke-width="1.5"/>' }
  return `<svg viewBox="0 0 40 40" stroke="#1d1a24" fill="#1d1a24" stroke-linecap="round"><path d="M8 40q0-9 12-9t12 9z" fill="${body}" stroke="none"/><circle cx="20" cy="20" r="12" fill="${skin}" stroke="none"/>${hair}<g>${eyes}${mouth}${extra}</g></svg>`
}
const SVGS = {
  mc: `<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="25" fill="#e8b84a"/><path d="M10 50q0-12 16-12t16 12z" fill="#7a5c8a"/><circle cx="26" cy="24" r="13" fill="#f2c9a0"/><path d="M12 22q1-14 14-14t14 14q-3-7-14-7t-14 7z" fill="#8a8a8a"/><circle cx="18" cy="9" r="5" fill="#8a8a8a"/><rect x="16" y="20" width="8" height="5" rx="1" fill="none" stroke="#c0392b" stroke-width="1.6"/><rect x="28" y="20" width="8" height="5" rx="1" fill="none" stroke="#c0392b" stroke-width="1.6"/><path d="M24 22h4" stroke="#c0392b" stroke-width="1.4"/><path d="M21 31q5 2 10 0" stroke="#1d1a24" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  icOpen: `<svg viewBox="0 0 48 32"><path d="M24 4v24" stroke="#1b1f3b" stroke-width="3" stroke-linecap="round"/><path d="M19 8L5 16l14 8z" fill="#1b1f3b"/><path d="M29 8l14 8-14 8z" fill="#1b1f3b"/></svg>`,
  icClose: `<svg viewBox="0 0 48 32"><path d="M24 4v24" stroke="#1b1f3b" stroke-width="3" stroke-linecap="round"/><path d="M4 8l14 8-14 8z" fill="#1b1f3b"/><path d="M44 8l-14 8 14 8z" fill="#1b1f3b"/></svg>`,
  boss: headSvg('boss', 'angry'),
}

// ---------- 画面の切り替え
const VIEWS = ['vTitle', 'vHow', 'vPlay', 'vResult']
function go(v) { for (const id of VIEWS) $('#' + id).hidden = id !== v; S.view = v }
function applyLang() {
  document.documentElement.lang = S.lang
  for (const el of $$('[data-t]')) el.textContent = T(el.dataset.t)
  $('#howCtl').innerHTML = isTouch ? T('howTouch') : T('howPC')
  $('#langLab').textContent = S.lang === 'ja' ? 'EN' : 'JA'
  const li = t => `<li><span class="ic">${headSvg(t)}</span>${TYPES[t][S.lang]}</li>`
  $('#listGood').innerHTML = ['boss', 'luggage', 'elderly', 'normal'].map(li).join('')
  const badLabel = { sweaty: TYPES.sweaty[S.lang], phone: TYPES.phone[S.lang], feint: S.lang === 'ja' ? 'フェイント（自販機へ）' : 'Fake (goes to vending)' }
  $('#listBad').innerHTML = ['sweaty', 'phone', 'feint'].map(t => `<li><span class="ic">${headSvg(t)}</span>${badLabel[t]}</li>`).join('') + `<li><span class="ic">${capSvg()}</span>${S.lang === 'ja' ? '満員のときは誰でも' : 'Anyone, when full'}</li>`
  if (S.view === 'vResult' && S.result) fillResult(S.result, true)
}
function capSvg() { return `<svg viewBox="0 0 40 40"><rect x="4" y="8" width="32" height="24" rx="4" fill="#e5383b"/><text x="20" y="25" font-size="12" font-weight="900" fill="#fff" text-anchor="middle" font-family="sans-serif">8/8</text></svg>` }
function startTitle() {
  S.phase = 'title'; go('vTitle'); setBot('good', 99); resetGame(1000 + Math.floor(Math.random() * 1e6), true)
  Snd.setTrack('muzak')
}
function startGame(seed) {
  S.bot = null
  resetGame(seed ?? Math.floor(Math.random() * 1e9), false)
  S.tut = store.get('tut', '0') !== '1'
  S.phase = 'count'; S.cd = 2.9; S.cdLast = -1; go('vPlay'); $('#count').hidden = false; hudCache = ''; updateHUD()
  Snd.setTrack('muzak')
}
function countTick() {
  const n = Math.ceil(S.cd)
  if (n !== S.cdLast) { S.cdLast = n; $('#countN').textContent = n > 0 ? n : ''; $('#countM').textContent = n > 0 ? T('ready') : T('readyGo'); if (n > 0) Snd.sfx('count'); else Snd.sfx('go') }
  if (S.cd <= -0.4) { $('#count').hidden = true; S.phase = 'play' }
}
function finish() {
  S.over = true; S.phase = 'result'; S.stop.ph = 'end'
  // 何もしなくても 0 に張り付かないよう、満点の 0.35 倍を下駄にして割合を出す
  const score = clamp(Math.round(100 * (S.raw + 0.35 * S.maxRaw) / Math.max(1, 1.35 * S.maxRaw)), 0, 100)
  const rank = D.RANKS.find(r => score >= r[0])
  const L = S.log
  const goodIn = (L.in.boss || 0) + (L.in.luggage || 0) + (L.in.elderly || 0) + (L.in.normal || 0)
  const badIn = (L.in.sweaty || 0) + (L.in.phone || 0)
  let special = null
  if (L.bossOut >= 2) special = 'exile'
  else if (badIn >= 4) special = 'terror'
  else if (goodIn === 0 && badIn === 0) special = 'idle'
  else if (L.bossOut === 0 && (L.in.boss || 0) >= 2 && score >= 70) special = 'clean'
  // 劇的な場面を撮れていなければ、終わった瞬間のかごの中を撮る
  if (!S.snapImg && !S.headless) { try { render(); S.snapImg = canvas.toDataURL('image/jpeg', 0.82) } catch (e) {} }
  S.result = { score, rank, special, log: L, snap: S.snapImg, seed: S.seed }
  if (!S.headless && !S.demo) { store.set('tut', '1'); S.tut = false }
  if (S.headless) return
  go('vResult'); fillResult(S.result, false)
}
function fillResult(R, instant) {
  const L = R.log, lang = S.lang
  const rk = R.rank
  $('#rRank').textContent = rk[1]
  $('#rTitle').innerHTML = (lang === 'ja' ? rk[2] : rk[3]) + (R.special ? `<small>${D.SPECIAL[lang][R.special]}</small>` : '')
  $('#rBossN').textContent = L.bossOut
  $('#rBoss').classList.toggle('zero', L.bossOut === 0)
  const items = obj => { const ks = D.ORDER.filter(k => obj[k]); return ks.length ? ks.map(k => `<span class="it" title="${TYPES[k][lang]}">${headSvg(k, obj === L.out ? 'despair' : 'calm')}x${obj[k]}</span>`).join('') : `<span class="none">${T('none')}</span>` }
  $('#rIn').innerHTML = items(L.in); $('#rOut').innerHTML = items(L.out)
  $('#rSub').innerHTML = `<div>${T('explode')}<b>${L.explode}</b></div><div>${T('buzz')}<b>${L.buzz}</b></div><div>${T('fooled')}<b>${L.fooled}</b></div>`
  $('#rComment').textContent = lang === 'ja' ? rk[4] : rk[5]
  const els = ['#rBoss', '#rLists', '#rSub', '#rMc']
  if (instant) { $('#rScore').textContent = R.score; $('#rRank').classList.add('on'); $('#rTitle').classList.add('on'); for (const e of els) $(e).classList.add('on'); return }
  for (const e of els) $(e).classList.remove('on'); $('#rRank').classList.remove('on'); $('#rTitle').classList.remove('on')
  $('#rScore').textContent = '0'
  clearTimeout(fillResult.tm); clearInterval(fillResult.iv)
  Snd.setTrack(null); Snd.sfx('roll')
  const t0 = performance.now(), dur = 1500
  let lastN = -1
  fillResult.iv = setInterval(() => {
    const k = clamp((performance.now() - t0) / dur, 0, 1), n = Math.round(R.score * ease(k))
    if (n !== lastN) { $('#rScore').textContent = n; lastN = n; if (n % 4 === 0) Snd.sfx('tick') }
    if (k >= 1) { clearInterval(fillResult.iv); reveal() }
  }, 30)
  const reveal = () => {
    $('#rRank').classList.add('on'); Snd.sfx('stamp')
    fillResult.tm = setTimeout(() => {
      $('#rTitle').classList.add('on')
      if (R.score >= 70) { Snd.sfx('cheer'); Snd.setTrack('result') } else if (R.score < 40) { Snd.sfx('boo'); Snd.setTrack('sad') } else Snd.setTrack('result')
      els.forEach((e, i) => setTimeout(() => { $(e).classList.add('on'); if (e === '#rBoss' && L.bossOut > 0) Snd.sfx('boss') }, 250 + i * 280))
    }, 380)
  }
  fillResult.skip = () => { clearInterval(fillResult.iv); clearTimeout(fillResult.tm); fillResult(R, true); if (R.score >= 40) Snd.setTrack('result'); else Snd.setTrack('sad') }
}

// ---------- 結果画像（1080x1350）
function loadImg(src) { return new Promise(r => { if (!src) return r(null); const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src }) }
function svgImg(svg) { return loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))) }
async function makeCard(R) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d')
  const lang = S.lang, L = R.log, F = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif"
  x.fillStyle = '#1b1f3b'; x.fillRect(0, 0, 1080, 1350)
  // 写真（ガラス越しの絶望の瞬間）
  const snap = await loadImg(R.snap)
  x.save(); x.beginPath(); x.roundRect(40, 40, 1000, 560, 28); x.clip()
  if (snap) { const s = Math.max(1000 / snap.width, 560 / snap.height), w = snap.width * s, h = snap.height * s; x.drawImage(snap, 40 + (1000 - w) / 2, 40 + (560 - h) / 2, w, h) }
  else { x.fillStyle = '#2a3060'; x.fillRect(40, 40, 1000, 560) }
  const g = x.createLinearGradient(0, 380, 0, 600); g.addColorStop(0, 'rgba(27,31,59,0)'); g.addColorStop(1, 'rgba(27,31,59,.92)'); x.fillStyle = g; x.fillRect(40, 380, 1000, 220)
  x.restore()
  x.textAlign = 'left'; x.fillStyle = '#e8b84a'; x.font = `900 76px ${F}`; x.fillText(lang === 'ja' ? 'エレベーター開閉係' : 'HOLD THE DOOR?', 80, 560)
  x.fillStyle = '#fff'; x.font = `800 28px ${F}`; x.fillText(T('catch'), 82, 474)
  // 点と判子
  x.fillStyle = '#fff8e8'; x.beginPath(); x.roundRect(40, 630, 1000, 680, 28); x.fill()
  x.fillStyle = '#6b5a3a'; x.font = `900 34px ${F}`; x.fillText(T('score'), 90, 700)
  x.fillStyle = '#1b1f3b'; x.font = `900 170px ${F}`; x.fillText(String(R.score), 84, 850); const sw = x.measureText(String(R.score)).width
  x.font = `900 60px ${F}`; x.fillText('%', 96 + sw, 850)
  x.save(); x.translate(860, 760); x.rotate(-0.25); x.strokeStyle = '#e5383b'; x.lineWidth = 12; x.beginPath(); x.arc(0, 0, 110, 0, 7); x.stroke(); x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 92, 0, 7); x.stroke()
  x.fillStyle = '#e5383b'; x.textAlign = 'center'; x.font = `900 130px ${F}`; x.fillText(R.rank[1], 0, 46); x.restore()
  // 称号の帯
  x.fillStyle = '#e5383b'; x.beginPath(); x.roundRect(80, 880, 920, 110, 18); x.fill()
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = `900 ${R.special ? 56 : 64}px ${F}`; x.fillText(lang === 'ja' ? R.rank[2] : R.rank[3], 540, R.special ? 940 : 958)
  if (R.special) { x.font = `800 30px ${F}`; x.fillText(D.SPECIAL[lang][R.special], 540, 978) }
  // 部長の行
  x.fillStyle = L.bossOut ? '#2b1a1a' : '#1d3b2a'; x.beginPath(); x.roundRect(80, 1010, 920, 100, 18); x.fill()
  const bi = await svgImg(headSvg('boss', L.bossOut ? 'angry' : 'calm')); if (bi) x.drawImage(bi, 100, 1020, 80, 80)
  x.textAlign = 'left'; x.fillStyle = '#fff'; x.font = `900 40px ${F}`; x.fillText(T('bossOut'), 200, 1075)
  x.textAlign = 'right'; x.fillStyle = L.bossOut ? '#ff6b6e' : '#7ad37a'; x.font = `900 72px ${F}`; x.fillText(L.bossOut + (lang === 'ja' ? '回' : 'x'), 970, 1088)
  // 乗せた・閉め出した
  const row = async (label, obj, y, col, ex) => {
    x.textAlign = 'left'; x.fillStyle = col; x.font = `900 30px ${F}`; x.fillText(label, 90, y + 44)
    let px = 330; const ks = D.ORDER.filter(k => obj[k])
    if (!ks.length) { x.fillStyle = '#8a7a5a'; x.font = `800 28px ${F}`; x.fillText(T('none'), px, y + 44) }
    for (const k of ks) { const im = await svgImg(headSvg(k, ex)); if (im) x.drawImage(im, px, y, 64, 64); x.fillStyle = '#1d1a24'; x.font = `900 30px ${F}`; x.fillText('x' + obj[k], px + 62, y + 46); px += 108; if (px > 940) break }
  }
  await row(T('inList'), L.in, 1125, '#14683a', 'calm')
  await row(T('outList'), L.out, 1200, '#8f1a1c', 'despair')
  x.textAlign = 'center'; x.fillStyle = '#e8b84a'; x.font = `800 26px ${F}`; x.fillText(T('url'), 540, 1335)
  return c
}
async function saveImage() {
  if (!S.result) return
  const c = await makeCard(S.result)
  const blob = await new Promise(r => c.toBlob(r, 'image/png'))
  const name = 'elevator-keeper-' + S.result.score + '.png'
  try {
    const file = new File([blob], name, { type: 'image/png' })
    if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: `${T('score')} ${S.result.score}% ${T('share')}` }); return 'share' }
  } catch (e) { if (e && e.name === 'AbortError') return 'abort' }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  toast(T('saved'))
  return 'download'
}
function toast(s) { const t = $('#toast'); t.textContent = s; t.hidden = false; clearTimeout(toast.tm); toast.tm = setTimeout(() => { t.hidden = true }, 1800) }

// ---------- ループ
let lastT = performance.now(), acc = 0, frames = 0, fpsT = performance.now(), fps = 0
function loop(now) {
  requestAnimationFrame(loop)
  let dt = (now - lastT) / 1000; lastT = now
  if (dt > 0.25) dt = 0.25
  if (!S.paused) { acc += dt; let n = 0; while (acc >= STEP && n < 10) { update(STEP); acc -= STEP; n++ } if (n >= 10) acc = 0 }
  updateDrops(dt)
  render()
  updateBubbles(S.paused ? 0 : dt)
  if (S.view === 'vPlay') updateHUD()
  Snd.tick()
  frames++; if (now - fpsT > 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now }
}

// ---------- 起動
function boot() {
  for (const el of $$('[data-face]')) el.innerHTML = SVGS[el.dataset.face]
  if (store.get('mute', '0') === '1') { Snd.muted = true; $('#icOn').hidden = true; $('#icOff').hidden = false }
  applyLang(); fitCamera()
  const on = (id, fn) => $(id).addEventListener('click', e => { Snd.init(); fn(e) })
  on('#bStart', () => { Snd.sfx('tap'); if (store.get('how', '0') === '1') startGame(); else { go('vHow'); S.howThenGo = true } })
  on('#bHow', () => { Snd.sfx('tap'); S.howThenGo = false; go('vHow') })
  on('#bHowBack', () => { Snd.sfx('tap'); go('vTitle') })
  on('#bHowGo', () => { Snd.sfx('tap'); store.set('how', '1'); startGame() })
  on('#bAgain', () => { Snd.sfx('tap'); startGame() })
  on('#bSave', () => saveImage())
  on('#bTitle', () => { Snd.sfx('tap'); startTitle() })
  on('#rCard', () => { if (fillResult.skip) fillResult.skip() })
  on('#bLang', () => { S.lang = S.lang === 'ja' ? 'en' : 'ja'; store.set('lang', S.lang); applyLang() })
  on('#bMute', () => { Snd.setMute(!Snd.muted); $('#icOn').hidden = Snd.muted; $('#icOff').hidden = !Snd.muted; store.set('mute', Snd.muted ? '1' : '0') })
  // 開閉ボタン（押した瞬間に効かせる）
  const bind = (id, fn) => { const el = $(id); el.addEventListener('pointerdown', e => { e.preventDefault(); Snd.init(); el.classList.add('press'); if (fn()) Snd.sfx('tap') }); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => el.classList.remove('press')); el.addEventListener('click', e => e.preventDefault()) }
  bind('#bOpen', () => S.phase === 'play' && setOpen())
  bind('#bClose', () => S.phase === 'play' && pressClose())
  window.addEventListener('keydown', e => {
    if (e.repeat) return
    const k = e.code
    if (S.view === 'vPlay' && S.phase === 'play') {
      if (k === 'ArrowLeft' || k === 'KeyA' || k === 'KeyO') { e.preventDefault(); Snd.init(); if (setOpen()) Snd.sfx('tap'); flashBtn('#bOpen') }
      if (k === 'ArrowRight' || k === 'KeyD' || k === 'KeyC' || k === 'Space') { e.preventDefault(); Snd.init(); if (pressClose()) Snd.sfx('tap'); flashBtn('#bClose') }
    } else if ((k === 'Enter' || k === 'Space') && S.view === 'vTitle') { e.preventDefault(); $('#bStart').click() }
  })
  window.addEventListener('resize', fitCamera)
  document.addEventListener('visibilitychange', () => { lastT = performance.now(); acc = 0 })
  startTitle()
  requestAnimationFrame(loop)
  window.__ekReady = true
}
function flashBtn(id) { const el = $(id); el.classList.add('press'); setTimeout(() => el.classList.remove('press'), 120) }

// ---------- 検証用の窓口
window.ek = {
  S, D, Snd, TYPES, BOTS, THREE, CAM, setFace,
  fillCar(n) { for (const r of S.riders) if (r.state === 'exitWait') r.state = 'ride'; let k = 0; while (carCount() < n && k++ < 10) { const P = makePerson('rider'); P.state = 'ride'; P.stay = 9; addRider(P, freeSlot()) } }, setOpen, pressClose, startGame, startTitle, finish, makeCard, saveImage, setBot, carCount, camera, scene, render,
  get fps() { return fps },
  // 頭を使わずに n 回のゲームをボットで回して点の分布を出す（描画なし）
  sim(botName, seed) {
    const keep = { headless: S.headless, phase: S.phase, view: S.view, bot: S.bot, demo: S.demo }
    S.headless = true; setBot(botName, seed * 7 + 1); resetGame(seed, false); S.phase = 'play'
    let n = 0; while (S.phase === 'play' && n++ < 60 * 200) update(STEP)
    const R = S.result
    Object.assign(S, keep); S.result = null
    return { list: R.log.list, nice: R.log.nice, fooled: R.log.fooled, raw: S.raw, maxRaw: S.maxRaw, score: R.score, rank: R.rank[1], bossOut: R.log.bossOut, buzz: R.log.buzz, explode: R.log.explode, people: R.log.people, stops: R.log.stops, special: R.special }
  },
  dbg: {
    pause: v => { S.paused = v },
    step: n => { for (let i = 0; i < n; i++) update(STEP) },
    render: () => { render(); updateBubbles(0); updateHUD() },
    until: (fn, max = 6000) => { let i = 0; while (!fn() && i++ < max) update(STEP); return i },
  },
}
boot()
