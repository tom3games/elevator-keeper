// 音のエンジン（素材なし・WebAudio）。曲はエレベーターのボサノバ風、効果音は全部合成
// 使い方: 最初のタップで Snd.init()、画面切替で Snd.setTrack('名前')、ループで毎フレーム Snd.tick()、検証は Snd.played と Snd.level()
const Snd = {
  ctx: null, muted: false, next: 0, step: 0, track: null, want: null, switchAt: 0, played: {}, last: {},
  TEMPO: { muzak: 108, hurry: 132, result: 112, sad: 70 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      this.ctx = new AC()
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.master.connect(this.an); this.an.connect(this.ctx.destination)
      this.bgm = this.ctx.createGain(); this.bgm.gain.value = 0.0001; this.bgm.connect(this.master)
      const len = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, len, len)
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      if (this.want) { const w = this.want; this.want = null; this.setTrack(w) }
    } catch (e) { this.ctx = null }
  },
  setMute(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7 },
  tone(f, t0, dur, type = 'square', vol = 0.2, dest, f2) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.02)
    return o
  },
  noise(t0, dur, vol, freq, type = 'highpass', dest, q, f2) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t0); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t0 + dur); if (q) f.Q.value = q
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02)
  },
  // 声っぽい音（のこぎり波をフォルマントで絞る）。情けない声・おーい・あぁ〜
  voice(t0, dur, f1, f2, vow = 800, vol = 0.18, vib = 0) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), bp = c.createBiquadFilter(), bp2 = c.createBiquadFilter(), g = c.createGain()
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f1, t0); o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 6.5; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05) }
    bp.type = 'bandpass'; bp.frequency.value = vow; bp.Q.value = 5; bp2.type = 'bandpass'; bp2.frequency.value = vow * 2.4; bp2.Q.value = 6
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.04); g.gain.setValueAtTime(vol, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(bp); o.connect(bp2); bp.connect(g); bp2.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05)
  },
  now() { return this.ctx ? this.ctx.currentTime : 0 },
  level() { if (!this.an) return 0; const d = new Float32Array(this.an.fftSize); this.an.getFloatTimeDomainData(d); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); return m },
  mtof: m => 440 * Math.pow(2, (m - 69) / 12),
  mark(n) { this.played[n] = (this.played[n] || 0) + 1 },
  setTrack(name) {
    if (this.want === name) return
    this.want = name; if (!this.ctx) return
    const now = this.ctx.currentTime, g = this.bgm.gain
    g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(0.0001, now + 0.25)
    this.switchAt = now + 0.27
  },
  tick() {
    if (!this.ctx) return; const c = this.ctx
    if (this.switchAt && c.currentTime >= this.switchAt) {
      this.track = this.want; this.step = 0; this.next = c.currentTime + 0.05; this.switchAt = 0
      const g = this.bgm.gain; g.cancelScheduledValues(c.currentTime); g.setValueAtTime(0.0001, c.currentTime); g.linearRampToValueAtTime(0.24, c.currentTime + 0.35)
      if (this.track) this.mark('bgm:' + this.track)
    }
    if (!this.track || this.switchAt) return
    const spb = 60 / this.TEMPO[this.track] / 4
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05
    while (this.next < c.currentTime + 0.25) { this['p_' + this.track](this.step, this.next); this.next += spb; this.step++ }
  },
  kick(t, v = 0.5) { this.tone(130, t, 0.14, 'sine', v, this.bgm, 45) },
  rim(t, v = 0.08) { this.tone(1700, t, 0.03, 'square', v * 0.4, this.bgm); this.noise(t, 0.03, v, 2500, 'bandpass', this.bgm, 3) },
  shaker(t, v = 0.03) { this.noise(t, 0.05, v, 7000, 'highpass', this.bgm) },
  bass(n, t, dur = 0.3, vol = 0.36) { this.tone(this.mtof(n), t, dur, 'triangle', vol, this.bgm) },
  ep(ns, t, dur = 0.5, vol = 0.035) { for (const n of ns) { this.tone(this.mtof(n), t, dur, 'sine', vol, this.bgm); this.tone(this.mtof(n) * 2, t, dur * 0.4, 'triangle', vol * 0.25, this.bgm) } },
  vib(n, t, dur = 0.5, vol = 0.05) { this.tone(this.mtof(n), t, dur, 'sine', vol, this.bgm); this.tone(this.mtof(n) * 4, t, dur * 0.25, 'sine', vol * 0.15, this.bgm) },
  // エレベーターのボサノバ（Dm9 - G13 - Cmaj9 - A7b9）
  p_muzak(i, t) { this.bossa(i, t, false) },
  p_hurry(i, t) { this.bossa(i, t, true) },
  bossa(i, t, hurry) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const root = [38, 43, 36, 45][bar], ch = [[60, 64, 65, 69], [59, 64, 65, 69], [59, 62, 64, 67], [58, 61, 64, 67]][bar]
    if (s === 0 || s === 6 || s === 8 || s === 14) this.bass(root + (s === 6 || s === 14 ? 7 : 0), t, 0.28, 0.32)
    if ([0, 3, 6, 10, 13].includes(s)) this.rim(t, hurry ? 0.1 : 0.07)
    if (s % 2 === 0) this.shaker(t, s % 4 ? 0.03 : 0.018)
    if (hurry && s % 4 === 0) this.kick(t, 0.45)
    if (s === 2 || s === 7 || s === 12) this.ep(ch, t, 0.32, 0.028)
    const mel = [[74, -1, 72, 69, -1, 72, -1, -1], [71, -1, 74, -1, 76, 74, -1, 71], [72, -1, -1, 71, 72, 76, -1, -1], [73, -1, 76, -1, 79, -1, 76, -1]]
    if (s % 2 === 0) { const n = mel[bar][s / 2]; if (n > 0) this.vib(n + (hurry ? 2 : 0), t, 0.45, 0.045) }
  },
  // 結果発表: にぎやかなファンファーレ風
  p_result(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const root = [48, 53, 55, 48][bar], ch = [[64, 67, 72], [65, 69, 72], [67, 71, 74], [64, 67, 72]][bar]
    if (s % 4 === 0) this.kick(t, 0.55); if (s === 4 || s === 12) this.noise(t, 0.08, 0.12, 1800, 'bandpass', this.bgm)
    if (s % 2 === 1) this.shaker(t, 0.03)
    if (s % 4 === 0 || s === 10) this.bass(root, t, 0.2, 0.36)
    if (s === 0 || s === 8) this.ep(ch, t, 0.4, 0.035)
    const mel = [[72, 76, 79, 76], [77, 76, 74, 72], [74, 79, 83, 79], [84, -1, 79, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.tone(this.mtof(n), t, 0.22, 'square', 0.03, this.bgm) }
  },
  // 残念: 物悲しいワルツ
  p_sad(i, t) {
    const bar = Math.floor(i / 12) % 4, s = i % 12
    const ch = [[57, 60, 64], [57, 62, 65], [56, 59, 64], [57, 60, 64]][bar], root = [33, 38, 40, 33][bar]
    if (s === 0) this.bass(root, t, 0.8, 0.3); if (s === 4 || s === 8) for (const n of ch) this.tone(this.mtof(n), t, 0.4, 'triangle', 0.02, this.bgm)
    const mel = [[76, 74, 72], [74, 72, 69], [71, 69, 68], [69, -1, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.tone(this.mtof(n), t, 0.5, 'sine', 0.06, this.bgm) }
  },
  // 効果音。同じ音の連打は間引く
  sfx(name, v = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime
    const gap = { tsk: 0.25, sigh: 0.5, pant: 0.4, phone: 0.35, door: 0.15 }[name]
    if (gap && t - (this.last[name] || 0) < gap) return
    this.last[name] = t; this.mark(name)
    switch (name) {
      case 'tap': this.tone(1320, t, 0.07, 'square', 0.07 * v); this.tone(1980, t + 0.01, 0.05, 'sine', 0.05 * v); break
      case 'ding': this.tone(988, t, 0.9, 'sine', 0.22); this.tone(784, t + 0.32, 1.1, 'sine', 0.22); this.tone(1976, t, 0.4, 'sine', 0.04); break
      case 'door': this.noise(t, 0.45, 0.06 * v, 600, 'bandpass', null, 1.5, 300); this.tone(90, t, 0.4, 'sine', 0.05 * v, null, 70); break
      case 'thud': this.tone(70, t, 0.18, 'sine', 0.4, null, 40); this.noise(t, 0.1, 0.12, 400, 'lowpass'); break
      case 'buzz': for (let k = 0; k < 2; k++) { this.tone(220, t + k * 0.6, 0.5, 'square', 0.14); this.tone(233, t + k * 0.6, 0.5, 'sawtooth', 0.08) } break
      case 'tsk': this.noise(t, 0.035, 0.35 * v, 3500, 'bandpass', null, 4); this.noise(t + 0.03, 0.02, 0.12 * v, 2000, 'bandpass', null, 3); break
      case 'sigh': this.noise(t, 0.9, 0.16 * v, 1400, 'bandpass', null, 1.2, 500); break
      case 'oi': this.voice(t, 0.35, 180, 230, 700, 0.2); this.voice(t + 0.38, 0.55, 230, 160, 650, 0.2, 6); break
      case 'despair': this.voice(t, 1.3, 330, 150, 750, 0.2, 14); break
      case 'boss': this.voice(t, 0.25, 140, 120, 600, 0.2); this.voice(t + 0.28, 0.9, 120, 85, 520, 0.22, 4); break
      case 'pant': for (let k = 0; k < 2; k++) this.noise(t + k * 0.18, 0.14, 0.12 * v, 1200, 'bandpass', null, 2); break
      case 'phone': for (let k = 0; k < 4; k++) this.voice(t + k * 0.08, 0.07, 260 + Math.random() * 160, 240 + Math.random() * 200, 900, 0.1); break
      case 'clunk': this.tone(160, t, 0.12, 'square', 0.12, null, 60); this.noise(t, 0.15, 0.2, 500, 'lowpass'); this.tone(1200, t + 0.25, 0.08, 'sine', 0.05); break
      case 'boom': this.tone(90, t, 0.7, 'sine', 0.5, null, 35); this.noise(t, 0.6, 0.25, 1200, 'lowpass'); for (let k = 0; k < 6; k++) this.voice(t + k * 0.05, 0.5, 200 + k * 30, 150, 700, 0.06); break
      case 'roll': for (let k = 0; k < 36; k++) this.noise(t + k * 0.04, 0.05, 0.04 + k * 0.004, 1800, 'bandpass'); break
      case 'stamp': this.tone(110, t, 0.25, 'sine', 0.6, null, 45); this.noise(t, 0.15, 0.3, 900, 'lowpass'); break
      case 'cheer': this.noise(t, 2, 0.14, 1200, 'bandpass', null, 0.6); for (let k = 0; k < 4; k++) this.tone(1800, t + k * 0.3, 0.3, 'sine', 0.05, null, 2600); break
      case 'boo': for (let k = 0; k < 7; k++) { const f = 105 + Math.random() * 40; this.tone(f, t + Math.random() * 0.2, 1.2, 'sawtooth', 0.04, null, f * 0.7) } break
      case 'count': this.tone(660, t, 0.12, 'square', 0.08); break
      case 'go': this.tone(880, t, 0.3, 'square', 0.1); this.tone(1320, t + 0.05, 0.3, 'square', 0.06); break
      case 'tick': this.tone(1500, t, 0.03, 'square', 0.05); break
      case 'nice': this.tone(1046, t, 0.12, 'triangle', 0.1); this.tone(1568, t + 0.07, 0.18, 'triangle', 0.08); break
      case 'gasp': this.voice(t, 0.3, 300, 420, 900, 0.12); break
    }
  },
}
window.Snd = Snd
