/* =========================================================
   DÜŞMÜŞ IŞIK — Bölüm I: Uyanış
   İzometrik, piksel-art aksiyon RPG (tarayıcı: PC + mobil)
   ========================================================= */
'use strict';
(() => {

// ---------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RNG = mulberry32(1337);
const rnd = (a = 1, b) => (b === undefined ? RNG() * a : a + RNG() * (b - a));
const frand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
function mk(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  fn && fn(g, c);
  return c;
}
const $ = id => document.getElementById(id);

// ---------------------------------------------------------
// Ekran / ölçekleme (düşük çözünürlüklü piksel tuval)
// ---------------------------------------------------------
const cv = $('game');
const ctx = cv.getContext('2d');
let VW = 480, VH = 270, SCALE = 4, DPR = 1;
const lightCv = document.createElement('canvas');
const lctx = lightCv.getContext('2d');
let vignetteCv = null;
let isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

let VIEW_TARGET = 320;
function resize() {
  DPR = window.devicePixelRatio || 1;
  const pw = Math.round(innerWidth * DPR), ph = Math.round(innerHeight * DPR);
  const target = VIEW_TARGET;
  SCALE = Math.max(1, Math.round(Math.min(pw, ph) / target));
  VW = Math.ceil(pw / SCALE); VH = Math.ceil(ph / SCALE);
  cv.width = VW; cv.height = VH;
  cv.style.width = (VW * SCALE / DPR) + 'px';
  cv.style.height = (VH * SCALE / DPR) + 'px';
  lightCv.width = VW; lightCv.height = VH;
  ctx.imageSmoothingEnabled = false;
  vignetteCv = mk(VW, VH, g => {
    const gr = g.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.max(VW, VH) * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(8,0,3,0.85)');
    g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
  });
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------
// Ses (WebAudio ile sentezlenmiş efektler)
// ---------------------------------------------------------
const Sfx = {
  ac: null, master: null, muted: false, noiseBuf: null, amb: null,
  init() {
    if (this.ac) { this.ac.resume(); return; }
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    this.master = this.ac.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ac.destination);
    const len = this.ac.sampleRate * 2;
    this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  ok() { return this.ac && !skipping; },
  tone(f, dur, type = 'sine', vol = 0.2, f2 = null, delay = 0) {
    if (!this.ok()) return;
    const t = this.ac.currentTime + delay;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, f1, f2, type = 'bandpass', q = 1, delay = 0) {
    if (!this.ok()) return;
    const t = this.ac.currentTime + delay;
    const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.5 + Math.random();
    const f = this.ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f1, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  swing() { this.noise(0.18, 0.35, 500 + Math.random() * 300, 3200 + Math.random() * 1200, 'bandpass', 1.5); },
  heavy() { this.noise(0.32, 0.5, 300, 2400, 'bandpass', 1.2); this.tone(120, 0.25, 'sawtooth', 0.08, 60); },
  hit() { this.tone(140, 0.12, 'square', 0.18, 45); this.noise(0.12, 0.35, 2000, 300, 'lowpass'); },
  fire() { this.noise(0.35, 0.25, 300, 2800, 'bandpass', 2); this.tone(260, 0.3, 'sawtooth', 0.06, 760); },
  explode() { this.noise(0.45, 0.4, 1500, 80, 'lowpass'); this.tone(90, 0.3, 'sine', 0.25, 40); },
  boom() { this.noise(1.6, 0.9, 1400, 40, 'lowpass'); this.tone(70, 1.4, 'sine', 0.7, 22); this.tone(40, 1.8, 'triangle', 0.4, 20); },
  heartbeat() { this.tone(58, 0.16, 'sine', 0.8, 38); this.tone(52, 0.2, 'sine', 0.65, 32, 0.2); },
  chime() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.09, null, i * 0.08)); },
  hurt() { this.tone(220, 0.18, 'sawtooth', 0.15, 90); this.noise(0.1, 0.2, 900, 300, 'lowpass'); },
  growl() { this.noise(0.5, 0.25, 260, 110, 'lowpass', 3); this.tone(75, 0.5, 'sawtooth', 0.08, 48); },
  orb() { this.tone(420, 0.25, 'sine', 0.08, 180); },
  dash() { this.noise(0.28, 0.3, 300, 1800, 'bandpass', 0.8); },
  wings() { this.noise(0.6, 0.3, 200, 1400, 'bandpass', 0.7); this.noise(0.5, 0.2, 300, 1200, 'bandpass', 0.7, 0.35); },
  whistle() { this.tone(1800, 1.3, 'sine', 0.06, 200); this.noise(1.3, 0.2, 4000, 300, 'bandpass', 4); },
  pickup() { this.tone(660, 0.15, 'triangle', 0.12, 990); this.tone(990, 0.2, 'triangle', 0.1, 1320, 0.08); },
  die() { this.noise(0.6, 0.3, 500, 60, 'lowpass', 2); this.tone(110, 0.5, 'sawtooth', 0.08, 30); },
  gun() { this.noise(0.12, 0.6, 4000, 600, 'highpass', 0.7); this.tone(140, 0.12, 'square', 0.12, 50); this.noise(0.3, 0.2, 900, 120, 'lowpass', 1, 0.03); },
  reload() { this.tone(900, 0.05, 'square', 0.05, 700); this.tone(600, 0.05, 'square', 0.05, 500, 0.35); },
  reloadDone() { this.tone(1200, 0.05, 'square', 0.06, 1000); this.noise(0.06, 0.2, 3000, 2000, 'bandpass', 2, 0.05); },
  jump() { this.tone(260, 0.14, 'square', 0.05, 520); },
  land() { this.noise(0.1, 0.25, 600, 120, 'lowpass'); },
  splash() { this.noise(0.6, 0.45, 1800, 300, 'bandpass', 0.8); this.noise(0.4, 0.3, 600, 100, 'lowpass', 1, 0.1); },
  thunder() { this.noise(2.6, 0.7, 500, 40, 'lowpass', 1); this.tone(38, 2, 'sine', 0.35, 25); },
  startRain() {
    if (!this.ac || this.rain) return;
    const ac = this.ac, s = ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    const g = ac.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.14, ac.currentTime + 2);
    s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this.master); s.start();
    this.rain = { s, g };
  },
  setRain(v) { if (this.rain) this.rain.g.gain.setTargetAtTime(Math.max(0.0001, 0.14 * v), this.ac.currentTime, 0.4); },
  stopRain() { if (this.rain) { const r = this.rain; r.g.gain.setTargetAtTime(0.0001, this.ac.currentTime, 0.5); setTimeout(() => { try { r.s.stop(); } catch (e) {} }, 3000); this.rain = null; } },
  nomana() { this.tone(160, 0.12, 'square', 0.06, 120); },
  roar() { this.noise(1.4, 0.6, 180, 60, 'lowpass', 4); this.tone(55, 1.4, 'sawtooth', 0.22, 35); this.tone(82, 1.2, 'sawtooth', 0.12, 41); },
  slam() { this.noise(0.8, 0.7, 900, 40, 'lowpass'); this.tone(48, 0.7, 'sine', 0.6, 25); },
  rumble() { this.noise(2.2, 0.5, 200, 50, 'lowpass', 2); },
  startAmbient() {
    if (!this.ac || this.amb) return;
    const ac = this.ac, out = ac.createGain();
    out.gain.value = 0.0001; out.connect(this.master);
    out.gain.exponentialRampToValueAtTime(1, ac.currentTime + 4);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.connect(out);
    [55, 55.6, 82.4].forEach((f, i) => {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const g = ac.createGain(); g.gain.value = i === 2 ? 0.025 : 0.045;
      o.connect(g); g.connect(lp); o.start();
    });
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ac.createGain(); lg.gain.value = 90; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    // rüzgâr
    const s = ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.8;
    const wg = ac.createGain(); wg.gain.value = 0.035;
    const lfo2 = ac.createOscillator(); lfo2.frequency.value = 0.13;
    const lg2 = ac.createGain(); lg2.gain.value = 250; lfo2.connect(lg2); lg2.connect(bp.frequency); lfo2.start();
    s.connect(bp); bp.connect(wg); wg.connect(out); s.start();
    this.amb = out;
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  },
};

// ---------------------------------------------------------
// Girdi: klavye, fare, dokunmatik
// ---------------------------------------------------------
const keys = {};
const mouse = { x: 0, y: 0, l: false, r: false, seen: false };
const touch = { sword: false, fire: false, dash: false, jump: false };
const joy = { id: null, active: false, cx: 0, cy: 0, x: 0, y: 0 };

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (k === 'escape' || k === 'p') togglePause();
  if ((k === ' ' || k === 'enter') && dlg.active) { advanceDialog(); }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; });

function toInternal(e) { return { x: e.clientX * DPR / SCALE, y: e.clientY * DPR / SCALE }; }

cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') {
    setTouchMode(true);
    if (e.clientX < innerWidth * 0.55 && joy.id === null) {
      joy.id = e.pointerId; joy.active = true; joy.cx = e.clientX; joy.cy = e.clientY; joy.x = joy.y = 0;
      placeJoy(e.clientX, e.clientY);
    }
    return;
  }
  setTouchMode(false);
  const p = toInternal(e); mouse.x = p.x; mouse.y = p.y; mouse.seen = true;
  if (e.button === 0) mouse.l = true;
  if (e.button === 2) mouse.r = true;
  if (dlg.active) advanceDialog();
});
addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') {
    if (e.pointerId === joy.id) {
      const dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
      const m = Math.hypot(dx, dy), R = 50;
      const k = m > R ? R / m : 1;
      joy.x = dx * k / R; joy.y = dy * k / R;
      $('joy-knob').style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    }
    return;
  }
  const p = toInternal(e); mouse.x = p.x; mouse.y = p.y; mouse.seen = true;
});
function endPointer(e) {
  if (e.pointerType === 'touch') {
    if (e.pointerId === joy.id) {
      joy.id = null; joy.active = false; joy.x = joy.y = 0;
      $('joy-knob').style.transform = '';
      resetJoy();
    }
    return;
  }
  if (e.button === 0) mouse.l = false;
  if (e.button === 2) mouse.r = false;
}
addEventListener('pointerup', endPointer);
addEventListener('pointercancel', endPointer);

function placeJoy(x, y) {
  const j = $('joy');
  j.style.left = (x - 65) + 'px'; j.style.top = (y - 65) + 'px'; j.style.bottom = 'auto';
}
function resetJoy() { const j = $('joy'); j.style.left = ''; j.style.top = ''; j.style.bottom = ''; }

function bindTouchBtn(id, key) {
  const b = $(id);
  const on = e => { e.preventDefault(); e.stopPropagation(); Sfx.init(); touch[key] = true; b.classList.add('active'); };
  const off = e => { e.preventDefault(); touch[key] = false; b.classList.remove('active'); };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
  b.addEventListener('pointercancel', off);
}
bindTouchBtn('t-sword', 'sword');
bindTouchBtn('t-fire', 'fire');
bindTouchBtn('t-dash', 'dash');
bindTouchBtn('t-jump', 'jump');

function setTouchMode(v) {
  if (v === isTouch) return;
  isTouch = v;
  document.body.classList.toggle('touch', v);
  resize();
}

// ---------------------------------------------------------
// İzometrik dönüşüm
// ---------------------------------------------------------
const TW = 32, TH = 16;
const cam = { x: 0, y: 0, rx: 0, ry: 0 };
const isoX = (x, y) => (x - y) * (TW / 2);
const isoY = (x, y) => (x + y) * (TH / 2);
const sX = (x, y) => Math.round(isoX(x, y) - cam.rx);
const sY = (x, y) => Math.round(isoY(x, y) - cam.ry);
// ekran yönü (piksel) -> dünya yönü
function screenDirToWorld(dx, dy) {
  const wx = dy / TH + dx / TW, wy = dy / TH - dx / TW;
  const m = Math.hypot(wx, wy) || 1;
  return { x: wx / m, y: wy / m };
}

// ---------------------------------------------------------
// HARİTA
// ---------------------------------------------------------
const MW = 48, MH = 48;
const F = { VOID: 0, STONE: 1, ASH: 2, SLAB: 3, BRIDGE: 4, GRASS: 5 };
const floor = new Uint8Array(MW * MH);
const solid = new Uint8Array(MW * MH);
const tall = new Uint8Array(MW * MH);
const idx = (i, j) => j * MW + i;
const inMap = (i, j) => i >= 0 && j >= 0 && i < MW && j < MH;
const isFloor = (i, j) => inMap(i, j) && floor[idx(i, j)] !== F.VOID;
function blocked(x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  if (!inMap(i, j)) return true;
  const k = idx(i, j);
  return floor[k] === F.VOID || solid[k] === 1;
}
function shotBlocked(x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  if (!inMap(i, j)) return true;
  return tall[idx(i, j)] === 1;
}

const ZONES = [
  { id: 'crater', name: 'Kül Krateri', cx: 39, cy: 39, r: 6.5 },
  { id: 'graves', name: 'Unutulmuşlar Mezarlığı', cx: 37, cy: 24, r: 6.5 },
  { id: 'chapel', name: 'Kanlı Şapel', cx: 23, cy: 39, r: 6 },
  { id: 'court', name: 'Yıkık Katedral', cx: 16, cy: 16, r: 10 },
];
const START = { x: 39.5, y: 39.5 };
const COURT_CP = { x: 23.5, y: 19.5 };
const ARENA = { x: 18.5, y: 16.5 };
const ALTAR = { i: 9, j: 9 };
const GATE = { i: 13, j: 10 };

function blob(cx, cy, r, type, override = true) {
  const p1 = rnd(TAU), p2 = rnd(TAU), p3 = rnd(TAU);
  for (let j = Math.floor(cy - r - 3); j <= cy + r + 3; j++)
    for (let i = Math.floor(cx - r - 3); i <= cx + r + 3; i++) {
      if (!inMap(i, j) || i < 1 || j < 1 || i > MW - 2 || j > MH - 2) continue;
      const dx = i + 0.5 - cx, dy = j + 0.5 - cy;
      const a = Math.atan2(dy, dx);
      const re = r * (1 + 0.14 * Math.sin(3 * a + p1) + 0.08 * Math.sin(5 * a + p2) + 0.05 * Math.sin(9 * a + p3));
      if (Math.hypot(dx, dy) < re) {
        const k = idx(i, j);
        if (override || floor[k] === F.VOID) floor[k] = type;
      }
    }
}
function pathLine(x0, y0, x1, y1, w, type, override = false) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3);
  for (let s = 0; s <= n; s++) {
    const t = s / n, px = lerp(x0, x1, t), py = lerp(y0, y1, t);
    for (let j = Math.floor(py - w); j <= py + w; j++)
      for (let i = Math.floor(px - w); i <= px + w; i++) {
        if (!inMap(i, j)) continue;
        if (Math.hypot(i + 0.5 - px, j + 0.5 - py) <= w / 2 + 0.2) {
          const k = idx(i, j);
          if (override || floor[k] === F.VOID) floor[k] = type;
        }
      }
  }
}

const objects = [];
const decals = []; // zemine işlenecek süsler
const route = [[39.5, 39.5], [37.5, 30], [37.5, 24], [31.5, 22], [24, 19.5], [18.5, 16.5], [14.5, 10.5]];
const route2 = [[39.5, 39.5], [23, 39.5]];
const keepClear = new Uint8Array(MW * MH);
function markClear(pts, rad) {
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, y0] = pts[s], [x1, y1] = pts[s + 1];
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3);
    for (let q = 0; q <= n; q++) {
      const px = lerp(x0, x1, q / n), py = lerp(y0, y1, q / n);
      for (let j = Math.floor(py - rad - 1); j <= py + rad + 1; j++)
        for (let i = Math.floor(px - rad - 1); i <= px + rad + 1; i++)
          if (inMap(i, j) && Math.hypot(i + 0.5 - px, j + 0.5 - py) <= rad) keepClear[idx(i, j)] = 1;
    }
  }
}

function addObj(kind, i, j, o = {}) {
  if (!isFloor(i, j)) return null;
  const k = idx(i, j);
  if (solid[k]) return null;
  const ob = Object.assign({ kind, i, j, x: i + 0.5, y: j + 0.5, depth: i + j + 1, alpha: 1 }, o);
  if (ob.solid !== false) solid[k] = 1;
  if (ob.tall) tall[k] = 1;
  objects.push(ob);
  return ob;
}

function buildMap() {
  RNG = mulberry32(1337);
  // Bölgeler
  blob(39, 39, 6.2, F.ASH);
  blob(41, 37, 2.5, F.STONE); blob(36, 41, 2.2, F.STONE);
  blob(37, 24, 6.2, F.GRASS);
  blob(23, 39, 5.6, F.STONE);
  blob(16, 16, 9.5, F.SLAB);
  for (let j = 5; j <= 14; j++) for (let i = 5; i <= 14; i++) floor[idx(i, j)] = F.SLAB;
  // Yollar
  pathLine(39, 37, 37.5, 28, 3, F.STONE);
  pathLine(37.5, 30, 37.5, 26, 2.6, F.STONE, true);
  pathLine(35, 39.5, 27, 39.5, 3, F.STONE);
  pathLine(31.5, 22, 23.5, 19.5, 2.2, F.BRIDGE);
  markClear(route, 1.3);
  markClear(route2, 1.3);
  for (let j = 7; j <= 13; j++) for (let i = 7; i <= 13; i++) keepClear[idx(i, j)] = 1;

  // ---- Katedral sunağı (iç avlu) ----
  for (let t = 7; t <= 13; t++) {
    addObj('wall', 7, t, { tall: true, h: 40 + Math.floor(rnd(14)), win: t % 2 === 1 && t > 7 && t < 13 });
    if (t > 7) addObj('wall', t, 7, { tall: true, h: 40 + Math.floor(rnd(14)), win: t % 2 === 1 && t < 13 });
  }
  for (let t = 8; t <= 13; t++) {
    if (t !== 9 && t !== 10 && t !== 11) addObj('wall', 13, t, { tall: true, h: 10 + Math.floor(rnd(8)), low: true });
    if (t !== 13) addObj('wall', t, 13, { tall: true, h: 10 + Math.floor(rnd(8)), low: true });
  }
  addObj('pillar', 13, 9, { tall: true, h: 46, broken: false });
  addObj('pillar', 13, 11, { tall: true, h: 46, broken: false });
  const gate = addObj('gate', GATE.i, GATE.j, { tall: true, open: false, openT: 0 });
  gate.depth = GATE.i + GATE.j + 1.2;
  addObj('altar', ALTAR.i, ALTAR.j, { shard: true });
  addObj('brazier', 8, 12, { tall: false });
  addObj('brazier', 12, 8, { tall: false });
  decals.push({ k: 'pool', x: 10.5, y: 10.8, rx: 1.4, ry: 1.0 });
  decals.push({ k: 'pool', x: 9.2, y: 11.6, rx: 0.7, ry: 0.5 });
  decals.push({ k: 'rune', x: 10, y: 10 });

  // ---- Dış avlu / arena ----
  for (let a = 0; a < 9; a++) {
    const ang = a / 9 * TAU + 0.3;
    const pi = Math.floor(ARENA.x + Math.cos(ang) * 5.6), pj = Math.floor(ARENA.y + Math.sin(ang) * 5.6);
    if (pi <= 14 && pj <= 14) continue;
    if (keepClear[idx(pi, pj)]) continue;
    addObj('pillar', pi, pj, { tall: true, h: rnd() < 0.4 ? 18 + Math.floor(rnd(10)) : 44 + Math.floor(rnd(10)), broken: rnd() < 0.5 });
  }
  addObj('brazier', 16, 21, {});
  addObj('brazier', 22, 14, {});
  addObj('brazier', 15, 12, {});
  addObj('brazier', 20, 20, {});
  for (let n = 0; n < 6; n++) decals.push({ k: 'pool', x: rnd(12, 24), y: rnd(12, 24), rx: rnd(0.5, 1.2), ry: rnd(0.4, 0.8) });
  // avlu kenarında yıkık duvar parçaları
  [[20, 8], [21, 8], [22, 9], [8, 20], [8, 21], [9, 22]].forEach(([i, j]) => addObj('wall', i, j, { tall: true, h: 14 + Math.floor(rnd(24)) }));

  // ---- Kül Krateri (başlangıç) ----
  decals.push({ k: 'crater', x: 39.5, y: 39.5 });
  [[35, 36], [42, 42], [43, 37], [35, 42]].forEach(([i, j]) => addObj('pillar', i, j, { tall: true, h: 16 + Math.floor(rnd(20)), broken: true }));
  [[42, 34], [43, 35]].forEach(([i, j]) => addObj('wall', i, j, { tall: true, h: 12 + Math.floor(rnd(18)) }));
  for (let n = 0; n < 3; n++) scatter('tree', 39, 39, 6, { tall: true });

  // ---- Mezarlık ----
  for (let n = 0; n < 22; n++) scatter('grave', 37, 24, 5.5, { tall: false, solid: false, cross: rnd() < 0.4 });
  for (let n = 0; n < 5; n++) scatter('tree', 37, 24, 6, { tall: true });
  for (let n = 0; n < 6; n++) decals.push({ k: 'bones', x: 37 + rnd(-5, 5), y: 24 + rnd(-5, 5) });

  // ---- Kanlı Şapel ----
  for (let t = 35; t <= 43; t++) {
    if (t !== 38 && t !== 39 && t !== 40 && rnd() < 0.85) addObj('wall', 18, t, { tall: true, h: 14 + Math.floor(rnd(30)), win: rnd() < 0.3 });
  }
  for (let t = 19; t <= 27; t++) {
    if (rnd() < 0.7) addObj('wall', t, 34, { tall: true, h: 14 + Math.floor(rnd(30)), win: rnd() < 0.3 });
  }
  addObj('shrine', 20, 40, { active: true });
  [[22, 36], [25, 36], [22, 42], [25, 42]].forEach(([i, j]) => addObj('pillar', i, j, { tall: true, h: rnd() < 0.5 ? 44 : 22, broken: rnd() < 0.6 }));
  decals.push({ k: 'pool', x: 23.5, y: 39.5, rx: 1.8, ry: 1.2 });
  decals.push({ k: 'pool', x: 21, y: 37.5, rx: 0.8, ry: 0.6 });
  decals.push({ k: 'pool', x: 26, y: 41, rx: 0.9, ry: 0.6 });
  for (let n = 0; n < 2; n++) scatter('tree', 23, 39, 5, { tall: true });

  // genel moloz
  for (let n = 0; n < 160; n++) {
    const i = Math.floor(rnd(MW)), j = Math.floor(rnd(MH));
    if (isFloor(i, j)) decals.push({ k: 'rubble', x: i + rnd(), y: j + rnd() });
  }
}
function scatter(kind, cx, cy, r, o) {
  for (let tries = 0; tries < 40; tries++) {
    const a = rnd(TAU), d = Math.sqrt(rnd()) * r;
    const i = Math.floor(cx + Math.cos(a) * d), j = Math.floor(cy + Math.sin(a) * d);
    if (!isFloor(i, j) || keepClear[idx(i, j)] || solid[idx(i, j)]) continue;
    // sınırda olmasın
    if (!isFloor(i + 1, j) || !isFloor(i, j + 1) || !isFloor(i - 1, j) || !isFloor(i, j - 1)) continue;
    return addObj(kind, i, j, Object.assign({}, o, { seed: Math.floor(rnd(1e6)) }));
  }
  return null;
}

// ---------------------------------------------------------
// Piksel sanat üreticileri (zemin, duvar, sütun, ağaç ...)
// ---------------------------------------------------------
const FLOOR_PAL = {
  [F.STONE]: [62, 50, 56],
  [F.ASH]: [52, 40, 38],
  [F.SLAB]: [74, 62, 68],
  [F.BRIDGE]: [72, 46, 30],
  [F.GRASS]: [46, 38, 32],
};
function makeTile(type, seed) {
  const r = mulberry32(seed);
  return mk(32, 16, g => {
    const img = g.createImageData(32, 16), d = img.data;
    const base = FLOOR_PAL[type];
    const slabTint = [r() * 14 - 7, r() * 14 - 7, r() * 14 - 7, r() * 14 - 7];
    for (let py = 0; py < 16; py++) {
      const hw = py < 8 ? (py + 1) * 2 : (16 - py) * 2;
      for (let px = 16 - hw; px < 16 + hw; px++) {
        const u = py / 16 + (px - 15.5) / 32, v = py / 16 - (px - 15.5) / 32;
        let n = (r() - 0.5) * 12;
        let c = 1;
        if (type === F.STONE) {
          const su = (u * 2) % 1, sv = (v * 2) % 1;
          const si = (Math.floor(u * 2) & 1) * 2 + (Math.floor(v * 2) & 1);
          n += slabTint[si];
          if (su < 0.07 || sv < 0.07) c = 0.55;
        } else if (type === F.SLAB) {
          n += slabTint[0] * 0.5;
          if (u < 0.05 || v < 0.05) c = 0.5;
          else if (u > 0.94 || v > 0.94) c = 0.8;
          else if (u < 0.1 || v < 0.1) c = 1.15;
        } else if (type === F.ASH) {
          const q = r();
          if (q < 0.05) n += 30; else if (q < 0.12) n -= 18;
        } else if (type === F.GRASS) {
          const q = r();
          if (q < 0.08) { d.set([86, 32, 30, 255], (py * 32 + px) * 4); continue; }
          if (q < 0.16) n -= 16;
        } else if (type === F.BRIDGE) {
          const pu = (u * 4) % 1;
          if (pu < 0.12) c = 0.35; else n += Math.sin(v * 40 + seed) * 6;
        }
        if (u < 0.02 || v < 0.02) c *= 0.85;
        const o = (py * 32 + px) * 4;
        d[o] = clamp((base[0] + n) * c, 0, 255);
        d[o + 1] = clamp((base[1] + n * 0.85) * c, 0, 255);
        d[o + 2] = clamp((base[2] + n * 0.9) * c, 0, 255);
        d[o + 3] = 255;
      }
    }
    // çatlak
    if (type !== F.BRIDGE && r() < 0.35) {
      let x = 8 + r() * 16, y = 4 + r() * 8;
      for (let s = 0; s < 8; s++) {
        x += r() * 2 - 1 + 0.6; y += r() * 1.4 - 0.7;
        const xi = Math.floor(x), yi = Math.floor(y);
        if (xi < 0 || xi > 31 || yi < 0 || yi > 15) break;
        const o = (yi * 32 + xi) * 4;
        if (d[o + 3]) { d[o] *= 0.45; d[o + 1] *= 0.45; d[o + 2] *= 0.45; }
      }
    }
    g.putImageData(img, 0, 0);
  });
}
const tileSet = {};
for (const t of [F.STONE, F.ASH, F.SLAB, F.BRIDGE, F.GRASS]) {
  tileSet[t] = [];
  for (let v = 0; v < 6; v++) tileSet[t].push(makeTile(t, t * 100 + v * 7 + 3));
}

function shade(rgb, k, n = 0) {
  return `rgb(${clamp(rgb[0] * k + n, 0, 255) | 0},${clamp(rgb[1] * k + n, 0, 255) | 0},${clamp(rgb[2] * k + n, 0, 255) | 0})`;
}

function wallSprite(h, win, seed) {
  const r = mulberry32(seed);
  const W = 32, H = 16 + h;
  const spr = mk(W, H, g => {
    const base = [70, 58, 64];
    // sol yüz
    for (let px = 0; px < 16; px++) {
      const top = 8 + Math.floor(px / 2);
      for (let y = 0; y < h; y++) {
        const row = Math.floor(y / 4);
        const mortar = y % 4 === 0 || (px + (row % 2) * 4) % 8 === 0;
        g.fillStyle = shade(base, mortar ? 0.5 : 0.78, (r() - 0.5) * 10);
        g.fillRect(px, top + y, 1, 1);
      }
    }
    // sağ yüz
    for (let px = 0; px < 16; px++) {
      const top = 16 - Math.floor((px + 1) / 2);
      for (let y = 0; y < h; y++) {
        const row = Math.floor(y / 4);
        const mortar = y % 4 === 0 || (px + (row % 2) * 4) % 8 === 0;
        g.fillStyle = shade(base, mortar ? 0.35 : 0.55, (r() - 0.5) * 8);
        g.fillRect(16 + px, top + y, 1, 1);
      }
    }
    // üst yüz
    for (let py = 0; py < 16; py++) {
      const hw = py < 8 ? (py + 1) * 2 : (16 - py) * 2;
      g.fillStyle = shade(base, 1.05, (r() - 0.5) * 10);
      g.fillRect(16 - hw, py, hw * 2, 1);
    }
    g.fillStyle = shade(base, 1.3); g.fillRect(14, 0, 4, 1);
    // gotik pencere
    if (win && h >= 34) {
      const wh = h - 18;
      for (const face of [0, 1]) {
        for (let c = 0; c < 4; c++) {
          const px = face === 0 ? 6 + c : 16 + 6 + c;
          const top = face === 0 ? 8 + Math.floor(px / 2) : 16 - Math.floor((px - 16 + 1) / 2);
          const arch = c === 0 || c === 3 ? 2 : 0;
          g.fillStyle = '#1a0406'; g.fillRect(px, top + 8 + arch, 1, wh - arch);
          if (c === 1 || c === 2) { g.fillStyle = '#8a2414'; g.fillRect(px, top + 10, 1, wh - 4); g.fillStyle = '#d0601e'; g.fillRect(px, top + 14, 1, 3); }
        }
      }
    }
    // yıkık kenar
    for (let c = 0; c < 32; c++) if (r() < 0.25) {
      const cut = 1 + Math.floor(r() * 5);
      const top = c < 16 ? Math.floor(Math.abs(c - 15.5) / 2) : Math.floor(Math.abs(c - 15.5) / 2);
      g.clearRect(c, 0, 1, top + cut);
    }
    // kırmızı yosun lekeleri
    for (let n = 0; n < 6; n++) { g.fillStyle = r() < 0.5 ? '#4a1016' : '#2a0a0e'; g.fillRect(Math.floor(r() * 32), 10 + Math.floor(r() * h), 1 + Math.floor(r() * 2), 1); }
  });
  return spr;
}
function pillarSprite(h, broken, seed) {
  const r = mulberry32(seed);
  const W = 16, H = h + 6;
  const spr = mk(W, H, g => {
    const shaft = ['#21181d', '#3a2e34', '#56484e', '#6c5e64', '#5e5056', '#4a3e44', '#342a30', '#241a20'];
    for (let c = 0; c < 8; c++) { g.fillStyle = shaft[c]; g.fillRect(4 + c, 3, 1, h - 3); }
    for (let y = 6; y < h - 4; y += 7) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(4, y, 8, 1); }
    g.fillStyle = '#4a3e44'; g.fillRect(2, H - 7, 12, 4);
    g.fillStyle = '#6a5c62'; g.fillRect(2, H - 7, 12, 1);
    g.fillStyle = '#251c22'; g.fillRect(2, H - 3, 12, 2);
    if (!broken) {
      g.fillStyle = '#4a3e44'; g.fillRect(2, 0, 12, 4);
      g.fillStyle = '#7a6c72'; g.fillRect(2, 0, 12, 1);
      g.fillStyle = '#2a2026'; g.fillRect(3, 3, 10, 1);
    } else {
      for (let c = 0; c < 8; c++) g.clearRect(4 + c, 0, 1, 3 + Math.floor(r() * 7));
    }
    for (let n = 0; n < 4; n++) { g.fillStyle = '#4a1016'; g.fillRect(4 + Math.floor(r() * 8), 6 + Math.floor(r() * (h - 8)), 1, 2); }
  });
  spr.ax = 8; spr.ay = H - 3;
  return spr;
}
function treeSprite(seed) {
  const r = mulberry32(seed);
  const W = 44, H = 54;
  const spr = mk(W, H, g => {
    function br(x, y, ang, len, wid, dep) {
      for (let i = 0; i < len; i++) {
        x += Math.cos(ang); y += Math.sin(ang);
        ang += (r() - 0.5) * 0.35;
        const w = Math.max(1, Math.round(wid * (1 - i / len * 0.6)));
        g.fillStyle = '#160c0f'; g.fillRect(Math.round(x) - (w >> 1), Math.round(y), w, 1);
        if (w > 1) { g.fillStyle = '#3a2422'; g.fillRect(Math.round(x) - (w >> 1), Math.round(y), 1, 1); }
        if (dep > 0 && i > len * 0.35 && r() < 0.11) br(x, y, ang + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), len * 0.62, wid * 0.65, dep - 1);
      }
    }
    br(22, H - 2, -Math.PI / 2, 26 + r() * 6, 4, 3);
    g.fillStyle = '#160c0f'; g.fillRect(17, H - 3, 10, 2);
  });
  spr.ax = 22; spr.ay = H - 2;
  return spr;
}
function graveSprite(cross, seed) {
  const r = mulberry32(seed);
  const spr = mk(14, 20, g => {
    const L = '#7a7078', M = '#5a5058', D = '#2c2630', O = '#120a0e';
    g.fillStyle = '#2a1e1a'; g.fillRect(1, 16, 12, 3);
    if (cross) {
      g.fillStyle = O; g.fillRect(5, 1, 4, 17); g.fillRect(2, 4, 10, 4);
      g.fillStyle = M; g.fillRect(6, 2, 2, 15); g.fillRect(3, 5, 8, 2);
      g.fillStyle = L; g.fillRect(6, 2, 1, 15); g.fillRect(3, 5, 8, 1);
    } else {
      g.fillStyle = O; g.fillRect(2, 4, 10, 14); g.fillRect(3, 2, 8, 2); g.fillRect(4, 1, 6, 1);
      g.fillStyle = M; g.fillRect(3, 4, 8, 13); g.fillRect(4, 3, 6, 1); g.fillRect(5, 2, 4, 1);
      g.fillStyle = L; g.fillRect(3, 4, 1, 13); g.fillRect(4, 3, 2, 1);
      g.fillStyle = D; g.fillRect(10, 4, 1, 13);
      g.fillRect(5, 7, 4, 1); g.fillRect(5, 9, 4, 1); g.fillRect(5, 11, 3, 1);
    }
    if (r() < 0.5) { g.fillStyle = '#4a1016'; g.fillRect(3 + Math.floor(r() * 6), 12, 2, 1); }
  });
  spr.ax = 7; spr.ay = 17;
  return spr;
}
const brazierSpr = (() => {
  const s = mk(14, 20, g => {
    g.fillStyle = '#120a0e'; g.fillRect(3, 9, 8, 11); g.fillRect(0, 6, 14, 5);
    g.fillStyle = '#3a2e2a'; g.fillRect(6, 10, 2, 9); g.fillRect(3, 17, 8, 2); g.fillRect(1, 7, 12, 3);
    g.fillStyle = '#7a5a40'; g.fillRect(1, 7, 12, 1);
    g.fillStyle = '#ff9a30'; g.fillRect(2, 6, 10, 1);
  });
  s.ax = 7; s.ay = 18; return s;
})();
const altarSpr = (() => {
  const s = mk(26, 20, g => {
    g.fillStyle = '#120a0e'; g.fillRect(0, 4, 26, 16);
    g.fillStyle = '#6a5c62'; g.fillRect(1, 5, 24, 4);
    g.fillStyle = '#8a7c82'; g.fillRect(1, 5, 24, 1);
    g.fillStyle = '#3e3238'; g.fillRect(1, 9, 24, 10);
    g.fillStyle = '#2a2026'; g.fillRect(4, 11, 18, 6);
    g.fillStyle = '#6a0e16'; g.fillRect(6, 8, 6, 2); g.fillRect(9, 10, 2, 5); g.fillRect(16, 9, 3, 1);
    g.fillStyle = '#c0a040'; g.fillRect(12, 12, 2, 4); g.fillRect(11, 13, 4, 1);
  });
  s.ax = 13; s.ay = 17; return s;
})();
const shrineSpr = (() => {
  const s = mk(24, 22, g => {
    g.fillStyle = '#120a0e'; g.fillRect(8, 8, 8, 14); g.fillRect(1, 3, 22, 7);
    g.fillStyle = '#4a3e44'; g.fillRect(9, 9, 6, 12); g.fillRect(2, 4, 20, 5);
    g.fillStyle = '#6a5c62'; g.fillRect(2, 4, 20, 1); g.fillRect(9, 9, 1, 12);
    g.fillStyle = '#2a2026'; g.fillRect(6, 19, 12, 2);
  });
  s.ax = 12; s.ay = 20; return s;
})();
// Kılıç (pivot: 5,3)
const swordSpr = mk(31, 7, g => {
  const O = '#24140a';
  g.fillStyle = O; g.fillRect(0, 1, 9, 5); g.fillRect(8, 0, 3, 7); g.fillRect(10, 1, 19, 5); g.fillRect(28, 2, 2, 3); g.fillRect(30, 3, 1, 1);
  g.fillStyle = '#c21a2e'; g.fillRect(1, 2, 2, 3);
  g.fillStyle = '#ff5566'; g.fillRect(1, 2, 1, 1);
  g.fillStyle = '#6a4416'; g.fillRect(3, 2, 5, 3);
  g.fillStyle = '#8a5a1e'; g.fillRect(3, 2, 5, 1);
  g.fillStyle = '#d8a63a'; g.fillRect(9, 1, 1, 5);
  g.fillStyle = '#f6d36b'; g.fillRect(9, 1, 1, 1);
  g.fillStyle = '#c21a2e'; g.fillRect(9, 3, 1, 1);
  g.fillStyle = '#fff3b0'; g.fillRect(11, 2, 17, 1);
  g.fillStyle = '#f6d36b'; g.fillRect(11, 3, 18, 1);
  g.fillStyle = '#a06d1f'; g.fillRect(11, 4, 17, 1);
  g.fillStyle = '#d8a63a'; g.fillRect(12, 3, 10, 1);
  g.fillStyle = '#fff'; g.fillRect(29, 3, 1, 1);
});
// Altın tabanca (kabza 0..4, namlu sağa)
const gunSpr = mk(14, 7, g => {
  g.fillStyle = '#24140a'; g.fillRect(2, 0, 12, 4); g.fillRect(1, 2, 5, 5);
  g.fillStyle = '#3a3238'; g.fillRect(7, 1, 7, 2);
  g.fillStyle = '#d8a63a'; g.fillRect(3, 1, 4, 2); g.fillRect(2, 3, 3, 3);
  g.fillStyle = '#f6d36b'; g.fillRect(3, 1, 4, 1);
  g.fillStyle = '#c21a2e'; g.fillRect(3, 4, 1, 1);
  g.fillStyle = '#6a6068'; g.fillRect(8, 1, 5, 1);
});
// Boss kılıcı
const bossSwordSpr = mk(40, 9, g => {
  g.fillStyle = '#0a0406'; g.fillRect(0, 2, 12, 5); g.fillRect(10, 0, 4, 9); g.fillRect(13, 1, 25, 7); g.fillRect(37, 3, 3, 3);
  g.fillStyle = '#5a0a12'; g.fillRect(1, 3, 2, 3);
  g.fillStyle = '#2a1a1e'; g.fillRect(3, 3, 8, 3);
  g.fillStyle = '#4a3a40'; g.fillRect(11, 1, 2, 7);
  g.fillStyle = '#4a4248'; g.fillRect(14, 2, 23, 2);
  g.fillStyle = '#2e282c'; g.fillRect(14, 4, 23, 3);
  g.fillStyle = '#ff2a2a'; for (let x = 16; x < 34; x += 4) g.fillRect(x, 4, 2, 1);
});

// Zemin önbelleği
const OX = MH * (TW / 2), OY = 8;
let floorCv = null;
const craterCracks = [];
function buildFloorCache() {
  const W = (MW + MH) * (TW / 2), H = (MW + MH) * (TH / 2) + 80;
  floorCv = mk(W, H, g => {
    const r = mulberry32(99);
    // derinlik sırasına göre
    for (let s = 0; s < MW + MH; s++) {
      for (let i = 0; i <= s; i++) {
        const j = s - i;
        if (!inMap(i, j) || !isFloor(i, j)) continue;
        const type = floor[idx(i, j)];
        const sx = isoX(i, j) + OX, sy = isoY(i, j) + OY;
        const set = tileSet[type];
        g.drawImage(set[(i * 7 + j * 13) % set.length], sx - 16, sy);
        // uçurum yüzleri
        const depth = 26 + ((i * 31 + j * 17) % 20);
        if (!isFloor(i, j + 1)) cliffFace(g, sx - 16, sy + 8, 1, depth, r, type);
        if (!isFloor(i + 1, j)) cliffFace(g, sx, sy + 16, -1, depth, r, type);
      }
    }
    // süslemeler
    for (const d of decals) drawDecal(g, d, r);
  });
}
function cliffFace(g, x0, y0, dir, depth, r, type) {
  // dir=1: sol-alt yüz (aşağı-sağa iner), dir=-1: sağ-alt yüz (yukarı-sağa çıkar)
  const lit = dir === 1 ? 0.75 : 0.5;
  for (let px = 0; px < 16; px++) {
    const top = dir === 1 ? y0 + Math.floor(px / 2) : y0 - Math.floor((px + 1) / 2);
    const dd = depth + Math.floor(r() * 6);
    for (let y = 0; y < dd; y += 2) {
      const f = y / dd;
      const k = lit * (1 - f * 0.75);
      const strata = (Math.floor((y + px * 0.3) / 5) % 2) * 6;
      const a = f > 0.6 ? 1 - (f - 0.6) / 0.4 : 1;
      const base = type === F.BRIDGE ? [70, 46, 30] : [66, 48, 52];
      g.fillStyle = `rgba(${(base[0] * k + strata + r() * 8) | 0},${(base[1] * k + r() * 6) | 0},${(base[2] * k + r() * 6) | 0},${a.toFixed(2)})`;
      g.fillRect(x0 + px, top + y, 1, 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x0 + px, top, 1, 1);
  }
}
function drawDecal(g, d, r) {
  const cx = isoX(d.x, d.y) + OX, cy = isoY(d.x, d.y) + OY;
  if (d.k === 'pool') {
    const rx = d.rx * 22, ry = d.ry * 11;
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const q = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (q > 1 + (r() - 0.5) * 0.25) continue;
      g.fillStyle = q > 0.75 ? '#3a070c' : q > 0.3 ? '#5a0a12' : '#701018';
      if (q < 0.25 && r() < 0.06) g.fillStyle = '#a0202a';
      g.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
    }
  } else if (d.k === 'rubble') {
    const n = 1 + Math.floor(r() * 3);
    for (let s = 0; s < n; s++) {
      const x = Math.round(cx + r() * 8 - 4), y = Math.round(cy + r() * 4 - 2);
      g.fillStyle = '#1e161a'; g.fillRect(x, y + 1, 3, 1);
      g.fillStyle = r() < 0.5 ? '#5a4c52' : '#6e6066'; g.fillRect(x, y, 2, 1);
    }
  } else if (d.k === 'bones') {
    g.fillStyle = '#b8ac98';
    g.fillRect(Math.round(cx) - 3, Math.round(cy), 5, 1); g.fillRect(Math.round(cx) - 4, Math.round(cy) - 1, 1, 3); g.fillRect(Math.round(cx) + 2, Math.round(cy) - 1, 1, 3);
    g.fillStyle = '#d8ccb6'; g.fillRect(Math.round(cx) + 3, Math.round(cy) + 2, 3, 2);
    g.fillStyle = '#201410'; g.fillRect(Math.round(cx) + 4, Math.round(cy) + 2, 1, 1);
  } else if (d.k === 'crater') {
    const rx = 46, ry = 23;
    for (let y = -ry - 3; y <= ry + 3; y++) for (let x = -rx - 6; x <= rx + 6; x++) {
      const q = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry)) + (r() - 0.5) * 0.12;
      if (q > 1.12) continue;
      let c;
      if (q > 0.92) c = r() < 0.5 ? '#6a5a5e' : '#4e4246';
      else if (q > 0.6) c = r() < 0.15 ? '#3a2a26' : '#261a1a';
      else c = r() < 0.1 ? '#2e1e1a' : '#170e0e';
      g.fillStyle = c; g.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
    }
    for (let k = 0; k < 11; k++) {
      const a = k / 11 * TAU + r() * 0.4;
      let x = cx, y = cy, line = [];
      const len = 24 + r() * 26;
      for (let s = 0; s < len; s++) {
        x += Math.cos(a) * 1.2 + (r() - 0.5); y += Math.sin(a) * 0.6 + (r() - 0.5) * 0.5;
        g.fillStyle = '#0a0404'; g.fillRect(Math.round(x), Math.round(y), 1, 1);
        if (s % 2 === 0) line.push([Math.round(x) - OX, Math.round(y) - OY]);
      }
      craterCracks.push(line);
    }
  } else if (d.k === 'rune') {
    g.strokeStyle = '#5a0a12'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(Math.round(cx), Math.round(cy), 30, 15, 0, 0, TAU); g.stroke();
    g.beginPath(); g.ellipse(Math.round(cx), Math.round(cy), 24, 12, 0, 0, TAU); g.stroke();
    for (let k = 0; k < 5; k++) {
      const a1 = k / 5 * TAU - Math.PI / 2, a2 = ((k + 2) % 5) / 5 * TAU - Math.PI / 2;
      g.beginPath(); g.moveTo(cx + Math.cos(a1) * 24, cy + Math.sin(a1) * 12); g.lineTo(cx + Math.cos(a2) * 24, cy + Math.sin(a2) * 12); g.stroke();
    }
  }
}

// Gökyüzü (kızıl bulutlar, tekrarlanan doku)
const skyCv = (() => {
  const S = 256;
  const r = mulberry32(7);
  function grid(gx, gy) { const a = []; for (let i = 0; i < gx * gy; i++) a.push(r()); return { gx, gy, a }; }
  const layers = [grid(4, 8), grid(8, 16), grid(16, 32), grid(32, 64)];
  const wts = [0.5, 0.27, 0.15, 0.08];
  const sm = t => t * t * (3 - 2 * t);
  function sample(G, u, v) {
    const x = u * G.gx, y = v * G.gy;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
    const at = (i, j) => G.a[((j % G.gy) + G.gy) % G.gy * G.gx + ((i % G.gx) + G.gx) % G.gx];
    return lerp(lerp(at(x0, y0), at(x0 + 1, y0), fx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), fx), fy);
  }
  const pal = [[12, 2, 6], [20, 3, 9], [32, 5, 13], [48, 8, 17], [70, 12, 21], [98, 18, 26], [130, 28, 32], [165, 46, 40]];
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return mk(S, S, g => {
    const img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let n = 0;
      for (let l = 0; l < 4; l++) n += sample(layers[l], x / S, y / S) * wts[l];
      n = Math.pow(clamp((n - 0.25) / 0.6, 0, 1), 1.6);
      const lv = clamp(Math.floor(n * 7.4 + bayer[(x & 3) + (y & 3) * 4] / 16 - 0.3), 0, 7);
      const c = pal[lv], o = (y * S + x) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
})();

// ---------------------------------------------------------
// Oyun durumu
// ---------------------------------------------------------
let state = 'title'; // title | intro | play | dialog | dead | end | paused
let prevState = 'play';
let time = 0, hitstop = 0, shake = 0;
let skipping = false;
const fx = { black: 1, flash: 0, red: 0, pillar: 0, shock: null, craterGlow: 0, titleFade: 0 };
const meteor = { active: false, t: 0, dur: 1.3 };
const particles = [], projectiles = [], numbers = [], pickups = [], embers = [];
let enemies = [];
let kills = 0, playStart = 0;
let currentZone = null, checkpoint = { ...START };
let boss = null, bossWoke = false, bossDead = false;
let gateObj = null, altarObj = null;
const tipsShown = {};

const hero = {
  x: START.x, y: START.y, r: 0.28,
  hp: 100, maxHp: 100, ammo: 8, maxAmmo: 8, reloadT: 0,
  vx: 0, vy: 0, moveAmt: 0, face: 1, back: false,
  aimX: 1, aimY: 0, aimSX: 1, aimSY: 0, anim: 0, moving: false,
  atk: null, lastStep: -1, comboT: 0, buffer: 0, atkCD: 0, trail: [],
  castT: 0, castX: 0, castY: 0, castZ: 40, fireCD: 0,
  dashT: 0, dashCD: 0, dashVX: 0, dashVY: 0, ghostT: 0, ghosts: [],
  invT: 0, flash: 0, visible: false, crouch: 1, wingSpread: 0, haloA: 0, dead: false,
};
// Hareket hızı (ekran pikseli / sn). Dikey biraz daha yavaş: izometrik derinlik hissi.
const SPD_X = 104, SPD_Y = 76;
// Kılıç kombosu: 3 vuruş (yatay kesik, ters kesik, ağır bitiriş)
const ATK = [
  { dur: 0.27, from: -1.9, to: 1.5, dmg: 24, kb: 5, lunge: 150, stop: 0.05, shake: 3, reach: 1.9 },
  { dur: 0.25, from: 1.7, to: -1.7, dmg: 26, kb: 6, lunge: 150, stop: 0.05, shake: 3, reach: 1.9 },
  { dur: 0.40, from: -2.7, to: 1.0, dmg: 42, kb: 11, lunge: 270, stop: 0.12, shake: 8, reach: 2.2 },
];
function screenVelToWorld(vx, vy) { return { x: vy / TH + vx / TW, y: vy / TH - vx / TW }; }

// ---------------------------------------------------------
// Düşmanlar
// ---------------------------------------------------------
function makeEnemy(type, x, y) {
  const base = { type, x, y, hx: x, hy: y, vx: 0, vy: 0, face: 1, anim: Math.random() * 10, flash: 0,
    state: 'idle', t: 0, cd: Math.random(), aggro: false, dead: false, deathT: 0, kbx: 0, kby: 0 };
  if (type === 'ghoul') Object.assign(base, { hp: 60, maxHp: 60, r: 0.32, speed: 2.5, dmg: 10 });
  if (type === 'wraith') Object.assign(base, { hp: 42, maxHp: 42, r: 0.32, speed: 2.0, dmg: 12 });
  if (type === 'boss') Object.assign(base, { hp: 650, maxHp: 650, r: 0.65, speed: 2.1, dmg: 22, state: 'sleep', castCD: 5, summoned: false });
  return base;
}
function spawnEnemies() {
  enemies = [];
  const list = [
    ['ghoul', 38.5, 32.5], ['ghoul', 36.5, 31.2],
    ['ghoul', 24.5, 37.5], ['ghoul', 22.5, 41.5], ['ghoul', 26.5, 40.5], ['wraith', 21.5, 37.5],
    ['wraith', 34.5, 21.5], ['wraith', 40.5, 25.5], ['wraith', 33.5, 26.5], ['ghoul', 37.5, 20.5], ['ghoul', 35.5, 24.5],
    ['ghoul', 21.5, 20.5], ['ghoul', 20.5, 15.5], ['wraith', 23.5, 14.5],
  ];
  for (const [t, x, y] of list) {
    const p = freeSpot(x, y);
    enemies.push(makeEnemy(t, p.x, p.y));
  }
  const bp = freeSpot(ARENA.x, ARENA.y);
  boss = makeEnemy('boss', bp.x, bp.y);
  enemies.push(boss);
}
function freeSpot(x, y) {
  if (!blocked(x, y)) return { x, y };
  for (let r = 1; r < 5; r++) for (let a = 0; a < 8; a++) {
    const px = x + Math.cos(a / 8 * TAU) * r, py = y + Math.sin(a / 8 * TAU) * r;
    if (!blocked(px, py)) return { x: px, y: py };
  }
  return { x, y };
}

// ---------------------------------------------------------
// Hareket ve çarpışma
// ---------------------------------------------------------
function collides(x, y, r) {
  return blocked(x - r, y - r) || blocked(x + r, y - r) || blocked(x - r, y + r) || blocked(x + r, y + r);
}
function tileBlocked(i, j) {
  if (!inMap(i, j)) return true;
  const k = idx(i, j);
  return floor[k] === F.VOID || solid[k] === 1;
}
// Varlığı engel karolarından dışarı it (köşelerde takılmadan kayar)
function pushOut(e) {
  const r = e.r;
  for (let it = 0; it < 3; it++) {
    let moved = false;
    const i0 = Math.floor(e.x - r), i1 = Math.floor(e.x + r), j0 = Math.floor(e.y - r), j1 = Math.floor(e.y + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!tileBlocked(i, j)) continue;
      const px = clamp(e.x, i, i + 1), py = clamp(e.y, j, j + 1);
      let dx = e.x - px, dy = e.y - py;
      const d = Math.hypot(dx, dy);
      if (d >= r) continue;
      if (d > 1e-6) { e.x += dx / d * (r - d + 0.001); e.y += dy / d * (r - d + 0.001); }
      else {
        // merkez karonun içinde: en kısa eksenden çık
        const l = e.x - i, rr = i + 1 - e.x, t = e.y - j, b = j + 1 - e.y;
        const m = Math.min(l, rr, t, b);
        if (m === l) e.x = i - r - 0.001; else if (m === rr) e.x = i + 1 + r + 0.001;
        else if (m === t) e.y = j - r - 0.001; else e.y = j + 1 + r + 0.001;
      }
      moved = true;
    }
    if (!moved) break;
  }
}
function moveEnt(e, dx, dy) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.15));
  const ox = e.x, oy = e.y;
  for (let s = 0; s < n; s++) { e.x += dx / n; e.y += dy / n; pushOut(e); }
  if (!isFinite(e.x) || !isFinite(e.y) || collides(e.x, e.y, e.r * 0.5)) { e.x = ox; e.y = oy; }
}

// ---------------------------------------------------------
// Efektler
// ---------------------------------------------------------
function addParticle(o) {
  particles.push(Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 1, max: 1, c: '#fff', s: 1, drag: 0.98, add: false }, o));
}
function burst(x, y, z, n, colors, spd = 2, up = 3, life = 0.6, add = false, g = 9) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = Math.random() * spd;
    const l = life * (0.5 + Math.random() * 0.7);
    addParticle({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: Math.random() * up, g, life: l, max: l,
      c: colors[(Math.random() * colors.length) | 0], s: Math.random() < 0.3 ? 2 : 1, add });
  }
}
function dmgNum(x, y, z, val, color) { numbers.push({ x, y, z, vz: 26, t: 0.9, val: Math.round(val), color }); }
const BLOOD = ['#5a0a12', '#8a1020', '#3a050a', '#a01828'];
const GOLD = ['#fff3b0', '#f6d36b', '#ffb040', '#ffffff'];
const SHADOWP = ['#2a1a2e', '#4a2a4e', '#120a14', '#6a1020'];

// ---------------------------------------------------------
// Kahraman güncelleme
// ---------------------------------------------------------
function heroScreen() { return { x: sX(hero.x, hero.y), y: sY(hero.x, hero.y) }; }
function nearestEnemy(range) {
  let best = null, bd = range;
  for (const e of enemies) {
    if (e.dead || e.state === 'sleep') continue;
    const d = Math.hypot(e.x - hero.x, e.y - hero.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function computeAim(range) {
  if (!isTouch && mouse.seen) {
    const hs = heroScreen();
    let dx = mouse.x - hs.x, dy = mouse.y - (hs.y - 30);
    if (Math.hypot(dx, dy) < 1) dx = hero.face;
    const w = screenDirToWorld(dx, dy), m = Math.hypot(dx, dy);
    return { sx: dx / m, sy: dy / m, wx: w.x, wy: w.y };
  }
  const t = nearestEnemy(range);
  let wx, wy;
  if (t) { const d = Math.hypot(t.x - hero.x, t.y - hero.y) || 1; wx = (t.x - hero.x) / d; wy = (t.y - hero.y) / d; }
  else { wx = hero.aimX; wy = hero.aimY; }
  const sx = (wx - wy) * 16, sy = (wx + wy) * 8, m = Math.hypot(sx, sy) || 1;
  return { sx: sx / m, sy: sy / m, wx, wy };
}

function heroHover(h) {
  const base = h.moveAmt > 0.25 ? 7 + Math.sin(h.anim * 6) * 1 : 6 + Math.sin(h.anim * 2.4) * 1.5;
  return Math.round(Math.max(0, base * (1 - h.crouch)));
}
function swordAngle(A) {
  const p = clamp(A.t / A.d.dur, 0, 1), wind = 0.16;
  const back = A.a0 - (A.a1 - A.a0) * 0.1;
  if (p < wind) return lerp(A.a0, back, easeOut(p / wind));
  const q = (p - wind) / (1 - wind);
  return lerp(back, A.a1, 1 - Math.pow(1 - q, 4));
}
// Kılıç tutan elin konumu: kahramanın ayak noktasına göre (ekran pikseli)
function heroSwordPose(h) {
  const z = heroHover(h), lo = Math.round(h.crouch * 12);
  const lean = Math.round(clamp(h.moveAmt, 0, 1.3) * 2) * h.face;
  const shx = h.face * 6 + lean, shy = -z - 38 + lo;
  if (h.atk) {
    const a = swordAngle(h.atk);
    return { shx, shy, hx: shx + Math.cos(a) * 10, hy: shy + Math.sin(a) * 7 + 2, ang: a };
  }
  const m = clamp(h.moveAmt, 0, 1.2);
  const ang = Math.PI / 2 + h.face * (-0.28 + m * 0.8) + Math.sin(h.anim * 2.4) * 0.04;
  return { shx, shy, hx: shx + h.face * (3 - m * 3), hy: shy + 13, ang };
}

function startAttack(step) {
  const h = hero, d = ATK[step];
  const a = computeAim(3.5);
  h.aimX = a.wx; h.aimY = a.wy; h.aimSX = a.sx; h.aimSY = a.sy;
  h.face = a.sx >= 0 ? 1 : -1;
  h.back = a.sy < -0.45;
  const ang = Math.atan2(a.sy, a.sx), s = h.face;
  h.atk = { step, d, t: 0, hit: false, a0: ang + d.from * s, a1: ang + d.to * s };
  const lg = nearestEnemy(1.0) ? d.lunge * 0.3 : d.lunge;
  h.vx = a.sx * lg; h.vy = a.sy * lg * 0.72;
  if (step === 2) Sfx.heavy(); else Sfx.swing();
}

function updateHero(dt) {
  const h = hero;
  h.anim += dt;
  h.atkCD -= dt; h.castT -= dt; h.fireCD -= dt; h.dashCD -= dt; h.invT -= dt; h.flash -= dt; h.comboT -= dt; h.buffer -= dt;
  if (h.reloadT > 0) { h.reloadT -= dt; if (h.reloadT <= 0) { h.ammo = h.maxAmmo; Sfx.reloadDone(); } }
  for (let i = h.ghosts.length - 1; i >= 0; i--) { h.ghosts[i].t -= dt; if (h.ghosts[i].t <= 0) h.ghosts.splice(i, 1); }
  for (const tr of h.trail) tr.age += dt;
  while (h.trail.length && h.trail[0].age > 0.12) h.trail.shift();
  if (h.dead) { h.vx = h.vy = 0; h.atk = null; return; }

  // ---- girdi (ekran yönü) ----
  let mx = 0, my = 0;
  if (keys.a || keys.arrowleft) mx -= 1;
  if (keys.d || keys.arrowright) mx += 1;
  if (keys.w || keys.arrowup) my -= 1;
  if (keys.s || keys.arrowdown) my += 1;
  if (joy.active) { mx = joy.x; my = joy.y; }
  let mag = Math.hypot(mx, my);
  if (mag > 1) { mx /= mag; my /= mag; mag = 1; }
  if (mag < 0.15) { mx = my = 0; mag = 0; }
  h.moving = mag > 0;
  if (h.moving) {
    const w = screenDirToWorld(mx, my); h.aimX = w.x; h.aimY = w.y;
    if (!h.atk && h.castT <= 0) { h.aimSX = mx / mag; h.aimSY = my / mag; }
  }

  // ---- kanat atılışı (saldırıyı iptal eder) ----
  if ((keys[' '] || keys.shift || touch.dash) && h.dashCD <= 0) {
    let dx = mx, dy = my;
    if (!h.moving) { dx = h.aimSX; dy = h.aimSY; }
    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;
    h.dashVX = dx * 440; h.dashVY = dy * 440 * 0.72;
    h.dashT = 0.17; h.dashCD = 0.7; h.invT = Math.max(h.invT, 0.3); h.atk = null; h.ghostT = 0;
    if (Math.abs(dx) > 0.15) h.face = dx > 0 ? 1 : -1;
    h.back = dy < -0.35;
    Sfx.dash();
    for (let i = 0; i < 12; i++) addParticle({ x: h.x, y: h.y, z: 20 + Math.random() * 24, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: 3, g: 2, life: 0.9, max: 0.9, c: Math.random() < 0.8 ? '#f1ebe0' : '#a3162a', s: 2 });
  }

  // ---- hız (ivmeli) ----
  if (h.dashT > 0) {
    h.dashT -= dt; h.vx = h.dashVX; h.vy = h.dashVY;
    h.ghostT -= dt;
    if (h.ghostT <= 0) { h.ghostT = 0.03; h.ghosts.push({ x: h.x, y: h.y, face: h.face, back: h.back, anim: h.anim, t: 0.3 }); }
    if (h.dashT <= 0) { h.vx *= 0.35; h.vy *= 0.35; }
  } else {
    const slow = h.atk ? 0.3 : (h.castT > 0 ? 0.6 : 1);
    const tx = mx * SPD_X * slow, ty = my * SPD_Y * slow;
    if (h.atk && h.atk.t < h.atk.d.dur * 0.4) {
      const k = Math.pow(0.004, dt); h.vx *= k; h.vy *= k; // ileri hamle sönümlenir
    } else {
      const k = Math.min(1, dt * (h.moving ? 13 : 16));
      h.vx += (tx - h.vx) * k; h.vy += (ty - h.vy) * k;
    }
  }
  const wv = screenVelToWorld(h.vx, h.vy);
  moveEnt(h, wv.x * dt, wv.y * dt);
  const sp = Math.hypot(h.vx, h.vy / 0.72);
  h.moveAmt = lerp(h.moveAmt, clamp(sp / SPD_X, 0, 1.4), Math.min(1, dt * 10));

  // ---- yön ----
  if (!h.atk && h.castT <= 0 && h.dashT <= 0 && h.moving) {
    if (Math.abs(mx) > 0.2) h.face = mx > 0 ? 1 : -1;
    if (my < -0.35) h.back = true; else if (my > 0.15) h.back = false;
  }

  // ---- kılıç kombosu ----
  if (mouse.l || touch.sword || keys.j) h.buffer = 0.18;
  if (h.atk) {
    const A = h.atk;
    A.t += dt;
    const p = A.t / A.d.dur;
    if (!A.hit && p >= 0.32) { A.hit = true; swordHit(A); }
    const chain = p >= 0.62 && h.buffer > 0 && A.step < 2;
    if (p >= 1 || chain) {
      h.lastStep = A.step; h.comboT = 0.45; h.atk = null;
      if (A.step === 2) h.atkCD = 0.3;
      if (chain) { h.buffer = 0; startAttack(A.step + 1); }
    }
  } else if (h.buffer > 0 && h.atkCD <= 0 && h.dashT <= 0) {
    h.buffer = 0;
    startAttack(h.comboT > 0 && h.lastStep < 2 ? h.lastStep + 1 : 0);
  }
  if (h.atk) {
    const ps = heroSwordPose(h), c = Math.cos(ps.ang), s = Math.sin(ps.ang);
    h.trail.push({ bx: ps.hx + c * 12, by: ps.hy + s * 12, tx: ps.hx + c * 31, ty: ps.hy + s * 31, age: 0 });
  }

  // ---- tabanca ----
  if (keys.r && h.reloadT <= 0 && h.ammo < h.maxAmmo) { h.reloadT = 1.1; Sfx.reload(); }
  if ((mouse.r || touch.fire || keys.k) && h.fireCD <= 0 && h.dashT <= 0 && !h.atk) {
    if (h.reloadT > 0) { /* dolduruluyor */ }
    else if (h.ammo > 0) {
      const a = computeAim(11);
      h.face = a.sx >= 0 ? 1 : -1;
      h.back = a.sy < -0.45;
      h.aimX = a.wx; h.aimY = a.wy; h.aimSX = a.sx; h.aimSY = a.sy;
      h.ammo--; h.fireCD = 0.2;
      const k = 0.7;
      const cz = clamp(heroHover(h) + 36 - a.sy * 13 + (a.wx + a.wy) * 8 * k, 20, 64);
      h.castT = 0.4; h.castX = a.wx * k; h.castY = a.wy * k; h.castZ = cz; h.muzzle = 0.06;
      projectiles.push({ owner: 'hero', x: h.x + a.wx * k, y: h.y + a.wy * k, z: cz, vx: a.wx * 18, vy: a.wy * 18, life: 0.7, dmg: 24, r: 0.3 });
      h.vx -= a.sx * 30; h.vy -= a.sy * 22; // geri tepme
      shake = Math.max(shake, 1.5);
      Sfx.gun();
      for (let i = 0; i < 6; i++) addParticle({ x: h.x + a.wx * k, y: h.y + a.wy * k, z: cz, vx: a.wx * (2 + Math.random() * 3) + (Math.random() - 0.5), vy: a.wy * (2 + Math.random() * 3) + (Math.random() - 0.5), vz: Math.random(), life: 0.15, max: 0.15, c: i % 2 ? '#fff3b0' : '#ffb040', add: true });
      addParticle({ x: h.x, y: h.y, z: cz - 4, vx: -a.wy * 1.5, vy: a.wx * 1.5, vz: 3, g: 12, life: 0.6, max: 0.6, c: '#d8a63a', s: 1 }); // boş kovan
      if (h.ammo === 0) { h.reloadT = 1.1; Sfx.reload(); }
    }
  }
  if (h.muzzle > 0) h.muzzle -= dt;

  if (Math.random() < dt * 3) addParticle({ x: h.x + (Math.random() - 0.5) * 0.6, y: h.y + (Math.random() - 0.5) * 0.6, z: 44 + Math.random() * 14, vz: 3, g: 0, life: 1.2, max: 1.2, c: '#ffe8a0', s: 1, add: true });
  if (h.moveAmt > 0.5 && Math.random() < dt * 10) addParticle({ x: h.x, y: h.y, z: 1, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, vz: 1, g: 2, life: 0.5, max: 0.5, c: '#4a3a36', s: 1 });
}

function swordHit(A) {
  const h = hero, d = A.d;
  let any = false;
  for (const e of enemies) {
    if (e.dead || e.state === 'sleep') continue;
    const dx = e.x - h.x, dy = e.y - h.y, dist = Math.hypot(dx, dy) || 0.001;
    if (dist > d.reach + e.r) continue;
    const dot = (dx * h.aimX + dy * h.aimY) / dist;
    if (A.step < 2 && dot < 0.1 && dist > 0.8) continue;
    if (A.step === 2 && dot < -0.2 && dist > 1.3) continue;
    damageEnemy(e, d.dmg + Math.random() * 10, dx / dist, dy / dist, d.kb);
    const ez = e.type === 'boss' ? 30 : 14;
    for (let i = 0; i < 9; i++) addParticle({ x: e.x, y: e.y, z: ez + Math.random() * 8, vx: (Math.random() - 0.5) * 5 + dx / dist * 3, vy: (Math.random() - 0.5) * 5 + dy / dist * 3, vz: Math.random() * 4, g: 6, life: 0.25, max: 0.25, c: i % 2 ? '#fff3b0' : '#ffffff', s: 1, add: true });
    any = true;
  }
  if (A.step === 2) {
    const px = h.x + h.aimX * 1.2, py = h.y + h.aimY * 1.2;
    fx.shock = { x: px, y: py, t: 0, max: 0.35, r: 1.7 };
    burst(px, py, 1, 16, ['#4a3a36', '#6a5a56', '#f6d36b'], 3, 3, 0.6, false, 6);
    shake = Math.max(shake, 3);
  }
  if (any) {
    Sfx.hit(); hitstop = d.stop; shake = Math.max(shake, d.shake);
  }
}

function damageEnemy(e, dmg, nx, ny, kb) {
  if (e.dead) return;
  e.hp -= dmg; e.flash = 0.12;
  e.stun = e.type === 'boss' ? 0.04 : 0.24;
  if (e.type !== 'boss' && (e.state === 'windup' || e.state === 'cast')) e.state = 'chase';
  if (e.type !== 'boss') { e.kbx += nx * kb; e.kby += ny * kb; }
  else { e.kbx += nx * kb * 0.15; e.kby += ny * kb * 0.15; }
  e.aggro = true;
  const z = e.type === 'boss' ? 30 : 14;
  dmgNum(e.x, e.y, z + 8, dmg, '#ffe08a');
  burst(e.x, e.y, z, 10, e.type === 'wraith' ? SHADOWP : BLOOD, 2.5, 4, 0.6);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true; e.deathT = 0;
  kills++;
  Sfx.die();
  burst(e.x, e.y, 12, 26, e.type === 'wraith' ? SHADOWP : BLOOD, 3, 5, 1);
  if (e.type !== 'boss' && Math.random() < 0.35) pickups.push({ kind: 'heal', x: e.x, y: e.y, t: 0 });
  if (e.type === 'boss') onBossDead();
}

function damageHero(dmg, sx, sy) {
  const h = hero;
  if (h.dead || h.invT > 0 || h.dashT > 0 || state !== 'play') return;
  h.hp -= dmg; h.invT = 0.6; h.flash = 0.08;
  shake = Math.max(shake, 5);
  fx.red = Math.max(fx.red, 0.35);
  Sfx.hurt();
  dmgNum(h.x, h.y, 34, dmg, '#ff4a4a');
  burst(h.x, h.y, 18, 8, ['#f6d36b', '#c21a2e', '#ffffff'], 2, 3, 0.5);
  if (sx !== undefined) { const d = Math.hypot(sx, sy) || 1; moveEnt(h, sx / d * 0.25, sy / d * 0.25); }
  if (h.hp <= 0) { h.hp = 0; heroDie(); }
}

// ---------------------------------------------------------
// Düşman yapay zekâsı
// ---------------------------------------------------------
function updateEnemies(dt) {
  for (const e of enemies) {
    e.anim += dt; e.flash -= dt;
    if (e.dead) { e.deathT += dt; continue; }
    // geri itme
    if (Math.abs(e.kbx) + Math.abs(e.kby) > 0.01) {
      moveEnt(e, e.kbx * dt, e.kby * dt);
      e.kbx *= Math.pow(0.0005, dt); e.kby *= Math.pow(0.0005, dt);
    }
    if (e.stun > 0) { e.stun -= dt; continue; }
    const dx = hero.x - e.x, dy = hero.y - e.y, d = Math.hypot(dx, dy) || 0.001;
    const nx = dx / d, ny = dy / d;
    if (hero.dead) { e.state = e.state === 'sleep' ? 'sleep' : 'idle'; continue; }
    if (e.type === 'ghoul') ghoulAI(e, dt, d, nx, ny);
    else if (e.type === 'wraith') wraithAI(e, dt, d, nx, ny);
    else if (e.type === 'boss') bossAI(e, dt, d, nx, ny);
  }
  // birbirinden ayrılma
  for (let a = 0; a < enemies.length; a++) {
    const A = enemies[a]; if (A.dead) continue;
    for (let b = a + 1; b < enemies.length; b++) {
      const B = enemies[b]; if (B.dead) continue;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), m = A.r + B.r;
      if (d < m && d > 0.001) {
        const p = (m - d) / 2, nx = dx / d, ny = dy / d;
        if (A.type !== 'boss') moveEnt(A, -nx * p, -ny * p);
        if (B.type !== 'boss') moveEnt(B, nx * p, ny * p);
      }
    }
  }
}
let lastGrowl = 0;
function aggroCheck(e, d, range) {
  if (!e.aggro && d < range) {
    e.aggro = true;
    if (time - lastGrowl > 1.2) { lastGrowl = time; Sfx.growl(); }
  }
  return e.aggro;
}
function ghoulAI(e, dt, d, nx, ny) {
  if (!aggroCheck(e, d, 7.5)) { e.face = Math.sin(e.anim * 0.5) > 0 ? 1 : -1; return; }
  e.cd -= dt;
  e.face = (nx - ny) >= 0 ? 1 : -1;
  if (e.state === 'windup') {
    e.t -= dt;
    if (e.t <= 0) {
      e.state = 'recover'; e.t = 0.35;
      if (d < 1.3) damageHero(e.dmg, nx, ny);
    }
    return;
  }
  if (e.state === 'recover') { e.t -= dt; if (e.t <= 0) e.state = 'chase'; return; }
  e.state = 'chase';
  if (d < 0.95 && e.cd <= 0) { e.state = 'windup'; e.t = 0.38; e.cd = 1.1; return; }
  if (d > 0.8) moveEnt(e, nx * e.speed * dt, ny * e.speed * dt);
}
function wraithAI(e, dt, d, nx, ny) {
  if (!aggroCheck(e, d, 9.5)) return;
  e.cd -= dt;
  e.face = (nx - ny) >= 0 ? 1 : -1;
  if (e.state === 'cast') {
    e.t -= dt;
    if (e.t <= 0) {
      e.state = 'chase';
      const a = Math.atan2(ny, nx);
      for (const off of [-0.18, 0, 0.18]) {
        projectiles.push({ owner: 'enemy', x: e.x + nx * 0.4, y: e.y + ny * 0.4, z: 16, vx: Math.cos(a + off) * 4.6, vy: Math.sin(a + off) * 4.6, life: 2.6, dmg: e.dmg, r: 0.28 });
      }
      Sfx.orb();
    }
    return;
  }
  // mesafe koru
  const strafe = Math.sin(e.anim * 0.9) * 0.6;
  if (d < 3.8) moveEnt(e, (-nx + -ny * strafe) * e.speed * dt, (-ny + nx * strafe) * e.speed * dt);
  else if (d > 6.5) moveEnt(e, nx * e.speed * dt, ny * e.speed * dt);
  else moveEnt(e, -ny * strafe * e.speed * dt, nx * strafe * e.speed * dt);
  if (e.cd <= 0 && d < 9) { e.state = 'cast'; e.t = 0.6; e.cd = 2.4 + Math.random(); }
}
function bossAI(e, dt, d, nx, ny) {
  if (e.state === 'sleep') {
    if (d < 5.8) wakeBoss();
    return;
  }
  if (e.state === 'waking') { e.t -= dt; if (e.t <= 0) e.state = 'chase'; return; }
  e.cd -= dt; e.castCD -= dt;
  e.face = (nx - ny) >= 0 ? 1 : -1;
  const enraged = e.hp < e.maxHp * 0.5;
  if (enraged && !e.summoned) {
    e.summoned = true;
    for (const [ox, oy] of [[2, 0], [0, 2], [-2, 0]]) {
      const p = freeSpot(e.x + ox, e.y + oy);
      const g = makeEnemy('ghoul', p.x, p.y); g.aggro = true; g.summon = true;
      enemies.push(g);
      burst(p.x, p.y, 4, 20, BLOOD, 2, 5, 0.8);
    }
    Sfx.roar(); shake = 8;
    tip('Bekçi öfkelendi!', 2000);
  }
  if (e.state === 'windup') {
    e.t -= dt;
    if (e.t <= 0) {
      e.state = 'recover'; e.t = enraged ? 0.5 : 0.8;
      Sfx.slam(); shake = 10;
      const px = e.x + e.sx * 1.1, py = e.y + e.sy * 1.1;
      burst(px, py, 2, 40, ['#3a2a26', '#5a4a46', '#a01828', '#ff6a3a'], 4, 5, 0.9);
      fx.shock = { x: px, y: py, t: 0, max: 0.45, r: 2.4 };
      if (Math.hypot(hero.x - px, hero.y - py) < 2.2) damageHero(e.dmg, hero.x - px, hero.y - py);
    }
    return;
  }
  if (e.state === 'cast') {
    e.t -= dt;
    if (e.t <= 0) {
      e.state = 'recover'; e.t = 0.5;
      const n = enraged ? 16 : 12;
      for (let k = 0; k < n; k++) {
        const a = k / n * TAU + e.anim;
        projectiles.push({ owner: 'enemy', x: e.x, y: e.y, z: 20, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 3, dmg: 14, r: 0.3 });
      }
      Sfx.orb(); Sfx.roar();
    }
    return;
  }
  if (e.state === 'recover') { e.t -= dt; if (e.t <= 0) e.state = 'chase'; return; }
  e.state = 'chase';
  if (e.castCD <= 0 && d < 10) { e.state = 'cast'; e.t = 0.9; e.castCD = enraged ? 4.5 : 6.5; return; }
  if (d < 1.9 && e.cd <= 0) {
    e.state = 'windup'; e.t = enraged ? 0.55 : 0.75; e.cd = enraged ? 1.2 : 1.7;
    e.sx = nx; e.sy = ny;
    return;
  }
  if (d > 1.3) moveEnt(e, nx * e.speed * (enraged ? 1.3 : 1) * dt, ny * e.speed * (enraged ? 1.3 : 1) * dt);
}
function wakeBoss() {
  if (bossWoke) return;
  bossWoke = true;
  boss.state = 'waking'; boss.t = 1.6; boss.aggro = true;
  Sfx.roar(); shake = 12;
  $('boss').classList.add('show');
  banner('Kanlı Bekçi', 2600);
  objective('Kanlı Bekçi\'yi yok et');
}
function onBossDead() {
  bossDead = true;
  $('boss').classList.remove('show');
  shake = 16; hitstop = 0.25; fx.flash = 0.8; tween(fx, 'flash', 0, 900);
  Sfx.boom();
  burst(boss.x, boss.y, 20, 80, ['#a01828', '#ff6a3a', '#3a050a', '#f6d36b'], 5, 8, 1.4);
  setTimeout(() => {
    if (!gateObj) return;
    gateObj.open = true;
    solid[idx(GATE.i, GATE.j)] = 0; tall[idx(GATE.i, GATE.j)] = 0;
    Sfx.rumble(); shake = 8;
    banner('Kapı açıldı', 2400);
    objective('Sunaktaki parıltıya dokun');
  }, 1500);
}

// ---------------------------------------------------------
// Mermiler, parçacıklar, toplanabilirler
// ---------------------------------------------------------
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    let hit = false;
    if (p.life <= 0 || shotBlocked(p.x, p.y)) hit = true;
    if (!hit && p.owner === 'hero') {
      for (const e of enemies) {
        if (e.dead || e.state === 'sleep') continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) {
          const d = Math.hypot(p.vx, p.vy) || 1;
          damageEnemy(e, p.dmg + Math.random() * 8, p.vx / d, p.vy / d, 4);
          hit = true; break;
        }
      }
      if (Math.random() < 0.3) addParticle({ x: p.x, y: p.y, z: p.z, vz: 0.5, life: 0.18, max: 0.18, c: '#ffe8a0', add: true });
    }
    if (!hit && p.owner === 'enemy') {
      if (!hero.dead && Math.hypot(hero.x - p.x, hero.y - p.y) < hero.r + p.r) {
        damageHero(p.dmg, p.vx, p.vy); hit = true;
      }
      if (Math.random() < 0.6) addParticle({ x: p.x, y: p.y, z: p.z, vz: 1, life: 0.4, max: 0.4, c: Math.random() < 0.5 ? '#ff2a3a' : '#6a0a2a', add: true });
    }
    if (hit) {
      if (p.owner === 'hero') {
        for (let k = 0; k < 8; k++) addParticle({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 4 - p.vx * 0.08, vy: (Math.random() - 0.5) * 4 - p.vy * 0.08, vz: Math.random() * 3, g: 8, life: 0.25, max: 0.25, c: k % 2 ? '#fff3b0' : '#ffb040', add: true });
      } else {
        burst(p.x, p.y, p.z, 8, ['#ff2a3a', '#6a0a2a', '#2a0a14'], 1.5, 2, 0.4, true, 2);
      }
      projectiles.splice(i, 1);
    }
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt * 8;
    p.vz -= p.g * dt;
    if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
    p.vx *= p.drag; p.vy *= p.drag;
  }
  for (let i = numbers.length - 1; i >= 0; i--) {
    const n = numbers[i]; n.t -= dt; n.z += n.vz * dt; n.vz *= 0.9;
    if (n.t <= 0) numbers.splice(i, 1);
  }
  // ekran uçuşan közler
  if (embers.length < 70) embers.push({ x: Math.random() * VW, y: VH + 4, vy: -(6 + Math.random() * 16), vx: (Math.random() - 0.5) * 6, life: 6 + Math.random() * 6, c: Math.random() < 0.7 ? '#ff5a2a' : '#f6d36b', ph: Math.random() * TAU });
  for (let i = embers.length - 1; i >= 0; i--) {
    const e = embers[i]; e.life -= dt; e.y += e.vy * dt; e.x += (e.vx + Math.sin(time + e.ph) * 4) * dt;
    if (e.life <= 0 || e.y < -5) embers.splice(i, 1);
  }
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += dt;
    const d = Math.hypot(hero.x - p.x, hero.y - p.y);
    if (d < 1.8 && !hero.dead) { p.x += (hero.x - p.x) * dt * 6; p.y += (hero.y - p.y) * dt * 6; }
    if (d < 0.45 && !hero.dead) {
      hero.hp = Math.min(hero.maxHp, hero.hp + 22);
      Sfx.pickup(); dmgNum(hero.x, hero.y, 34, 22, '#7aff8a');
      burst(hero.x, hero.y, 14, 12, ['#ff4a5a', '#ffb0b0'], 1.5, 3, 0.5, true);
      pickups.splice(i, 1);
    } else if (p.t > 30) pickups.splice(i, 1);
  }
}

// ---------------------------------------------------------
// Tetikleyiciler (bölge, kontrol noktası, sunak)
// ---------------------------------------------------------
function updateTriggers() {
  let z = null;
  for (const zo of ZONES) if (Math.hypot(hero.x - zo.cx, hero.y - zo.cy) < zo.r + 1) { z = zo; break; }
  if (z && z !== currentZone) {
    currentZone = z;
    banner(z.name, 2600);
    if (z.id === 'court') {
      checkpoint = { ...COURT_CP };
      if (!bossDead) objective('Katedralin önündeki gölgeye dikkat et');
    }
    if (z.id === 'chapel' && !tipsShown.chapel) { tipsShown.chapel = true; tip('Şapelin içindeki <b>Kan Sunağı</b> yaralarını iyileştirir', 3500); }
    if (z.id === 'graves' && !tipsShown.graves) { tipsShown.graves = true; tip('Hortlaklar uzaktan saldırır — <b>atılışla</b> kaç, <b>tabancayla</b> vur', 3800); }
  }
  for (const o of objects) {
    if (o.kind === 'shrine' && o.active && Math.hypot(hero.x - o.x, hero.y - o.y) < 1.3) {
      o.active = false;
      hero.hp = hero.maxHp; hero.ammo = hero.maxAmmo; hero.reloadT = 0;
      Sfx.chime();
      burst(o.x, o.y, 16, 30, ['#ff4a5a', '#ffb0b0', '#ffffff'], 2, 6, 1, true, 2);
      tip('Kan Sunağı seni tamamen iyileştirdi', 2500);
    }
  }
  if (bossDead && altarObj && altarObj.shard && Math.hypot(hero.x - altarObj.x, hero.y - altarObj.y) < 1.5) {
    altarObj.shard = false;
    runEnding();
  }
}

// ---------------------------------------------------------
// ÇİZİM — karakterler
// ---------------------------------------------------------
let FL = null;
function P(x, y, w, h, c) { ctx.fillStyle = FL || c; ctx.fillRect(x, y, w, h); }
function shadow(x, y, w, a = 0.45) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  const h = Math.max(2, Math.round(w / 3));
  for (let r = 0; r < h; r++) {
    const t = (r + 0.5) / h * 2 - 1;
    const ww = Math.round(w * Math.sqrt(1 - t * t));
    ctx.fillRect(x - ww, y - (h >> 1) + r, ww * 2, 1);
  }
}

const HC = {
  O: '#24140a', Y: '#f6d36b', y: '#d8a63a', o: '#a06d1f', d: '#5a3a12', HL: '#fff3b0',
  ru: '#c21a2e', ruL: '#ff5566', ruD: '#6a0a16',
  sk: '#e9b893', skS: '#b67d5c',
  ha: '#f2d27a', haS: '#c69a3c', haD: '#8a6526',
  wh: '#f1ebe0', whS: '#b9b0a2',
};
function feather(x0, y0, x1, y1, pass) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
  for (let i = 0; i <= steps; i++) {
    const f = steps ? i / steps : 0;
    const x = Math.round(lerp(x0, x1, f)), y = Math.round(lerp(y0, y1, f));
    if (pass === 0) P(x - 3, y - 1, 6, 3, HC.O);
    else {
      let c = HC.wh;
      if (f > 0.88) c = f > 0.96 ? HC.ruD : '#a3162a';
      else if (f > 0.68) c = '#ddd3c6';
      P(x - 2, y, 4, 1, c);
      P(x - 2, y, 1, 1, f > 0.88 ? HC.ruD : HC.whS);
    }
  }
}
function drawWing(s, spread, flap, lo, sweep) {
  const rootX = s * 4, rootY = -38 + lo;
  const wristX = s * (6 + 15 * spread) - sweep, wristY = -53 - 5 * spread + flap + lo;
  const tipX = s * (8 + 23 * spread) - sweep * 1.6, tipY = -42 + flap * 1.6 + lo;
  const N = 16, list = [];
  for (let k = N - 1; k >= 0; k--) {
    const f = k / (N - 1);
    let ax, ay;
    if (f < 0.5) { const q = f / 0.5; ax = lerp(rootX, wristX, q); ay = lerp(rootY, wristY, q); }
    else { const q = (f - 0.5) / 0.5; ax = lerp(wristX, tipX, q); ay = lerp(wristY, tipY, q); }
    const len = (7 + f * 22 + Math.sin(f * Math.PI) * 4) * (0.35 + 0.65 * spread);
    list.push([ax, ay, ax + s * (1 + f * 6) * spread - sweep * f, ay + len]);
  }
  for (const L of list) feather(L[0], L[1], L[2], L[3], 0);
  for (const L of list) feather(L[0], L[1], L[2], L[3], 1);
  for (let k = 0; k < 6; k++) {
    const f = k / 5;
    const ax = Math.round(lerp(rootX, wristX, f)), ay = Math.round(lerp(rootY, wristY, f));
    P(ax - 2, ay - 1, 5, 5, HC.O); P(ax - 1, ay, 3, 3, HC.wh); P(ax - 1, ay + 2, 3, 1, HC.whS);
  }
}
function drawHalo(y, a) {
  ctx.globalAlpha *= a;
  for (let k = 0; k < 44; k++) {
    const t = k / 44 * TAU;
    P(Math.round(Math.cos(t) * 9), Math.round(y + Math.sin(t) * 2.5), 1, 1, k % 3 ? '#f6d36b' : '#fff3b0');
  }
  for (let k = 0; k < 9; k++) {
    const t = Math.PI + (k + 0.5) / 9 * Math.PI;
    const bx = Math.cos(t) * 9, by = y + Math.sin(t) * 2.5;
    for (let l = 1; l <= 3 + (k % 2); l++) P(Math.round(bx + Math.cos(t) * l * 0.6), Math.round(by + Math.sin(t) * l), 1, 1, '#f6d36b');
  }
  ctx.globalAlpha /= a;
}
function drawSword(spr, x, y, ang, px, py) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.drawImage(spr, -px, -py); ctx.restore();
}
// Kalın bölüm çizgisi (uzuvlar): önce dış hat, sonra dolgu
function seg(x0, y0, x1, y1, w, c, o) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const hw = w >> 1;
  if (o) for (let i = 0; i <= n; i++) { const f = i / n; P(Math.round(lerp(x0, x1, f)) - hw - 1, Math.round(lerp(y0, y1, f)) - hw - 1, w + 2, w + 2, o); }
  for (let i = 0; i <= n; i++) { const f = i / n; P(Math.round(lerp(x0, x1, f)) - hw, Math.round(lerp(y0, y1, f)) - hw, w, w, c); }
}

// Pelerin: omuzlardan dizlere, harekette geriye savrulur
function drawCape(X, u, m, t, front, narrow) {
  const top = -40 + u, bot = -5 + Math.round(u * 0.3);
  const wT = narrow ? 5 : 7, wB = narrow ? 6 : 8;
  for (let y = top; y <= bot; y++) {
    const f = (y - top) / (bot - top);
    const fl = Math.sin(t * 4 + f * 5) * f * 1.5;
    const l = Math.round(lerp(X - wT, -wB - 1 - m * 7, f) + fl), r = Math.round(lerp(X + wT, wB - 1 - m * 7, f) + fl);
    P(l - 1, y, r - l + 2, 1, HC.O);
    P(l, y, r - l, 1, f > 0.9 ? HC.ruD : HC.whS);
    if (front) P(l, y, Math.max(1, Math.round((r - l) * 0.35)), 1, f > 0.9 ? '#a3162a' : HC.wh);
  }
  for (let k = 0; k < 8; k++) {
    const x = Math.round(lerp(-wB - 1 - m * 7, wB - 1 - m * 7, k / 7));
    P(x, bot + 1, 2, 1 + ((k + Math.floor(t * 5)) % 2), HC.ruD);
  }
}
function drawLegs(c, u, m, t, back) {
  if (LEGW) { drawWalkLegs(u); return; }
  const sw = Math.sin(t * (m > 0.25 ? 7 : 2)) * (m > 0.25 ? 1 : 0.35);
  const hipY = -22 + u;
  const legs = [
    { hx: -2, fx: -2 - m * 4 - sw * m * 2, fy: -1 + m * 2, kfx: -9, kkx: -3, kky: -2, dark: true },
    { hx: 2, fx: 3 - m * 2 + sw * m * 2, fy: 0, kfx: 6, kkx: 6, kky: -9, dark: false },
  ];
  for (const L of legs) {
    const fx = lerp(L.fx, L.kfx, c), fy = lerp(L.fy, 0, c);
    const kx = lerp((L.hx + L.fx) / 2 + 1.5, L.kkx, c), ky = lerp((hipY + L.fy) / 2, L.kky, c);
    const col = L.dark ? HC.o : HC.y, hl = L.dark ? HC.y : HC.Y;
    seg(L.hx, hipY, kx, ky, 5, col, HC.O);
    seg(kx, ky, fx, fy - 2, 4, col, HC.O);
    seg(L.hx - 1, hipY, kx - 1, ky, 1, hl);
    P(Math.round(kx) - 1, Math.round(ky) - 1, 3, 3, hl); P(Math.round(kx), Math.round(ky), 1, 1, HC.ru);
    P(Math.round(fx) - 2, Math.round(fy) - 3, 4, 3, HC.O); P(Math.round(fx) - 1, Math.round(fy) - 2, 3, 2, HC.o);
    P(Math.round(fx) + (back ? -2 : 1), Math.round(fy) - 1, 2, 1, HC.O);
  }
}
function drawBodyFront(m, t, u, lean, c, castOff) {
  const X = lean;
  drawCape(X, u, m, t, false);
  // arka omuzluk + arka kol
  P(X - 11, -44 + u, 7, 8, HC.O); P(X - 10, -43 + u, 5, 6, HC.o); P(X - 10, -43 + u, 5, 1, HC.y);
  if (!castOff) {
    const sw = Math.sin(t * 7) * m * 2;
    seg(X - 8, -38 + u, X - 9 - sw, -31 + u, 4, HC.o, HC.O);
    seg(X - 9 - sw, -31 + u, X - 8 - sw * 1.5, -25 + u, 4, HC.d, HC.O);
  }
  drawLegs(c, u, m, t, false);
  // tabard
  const tb = Math.round(-m * 3 + Math.sin(t * 3) * 0.6);
  seg(0, -25 + u, tb, -9 + u, 3, HC.ru, HC.O);
  P(tb - 1, -10 + u, 3, 2, HC.ruD);
  // tassetler + kemer
  P(-7, -27 + u, 6, 7, HC.O); P(-6, -26 + u, 4, 5, HC.o); P(-6, -26 + u, 4, 1, HC.y);
  P(1, -27 + u, 6, 7, HC.O); P(2, -26 + u, 4, 5, HC.y); P(2, -26 + u, 4, 1, HC.Y);
  P(X - 6, -29 + u, 13, 3, HC.O); P(X - 5, -28 + u, 11, 1, HC.d); P(X, -29 + u, 2, 3, HC.ruL);
  // göğüs zırhı
  P(X - 7, -42 + u, 14, 14, HC.O);
  P(X - 6, -41 + u, 12, 12, HC.y);
  P(X - 6, -41 + u, 5, 11, HC.Y); P(X - 6, -41 + u, 1, 8, HC.HL);
  P(X + 3, -40 + u, 3, 11, HC.o);
  P(X - 5, -31 + u, 10, 1, HC.o); P(X - 4, -34 + u, 8, 1, HC.o);
  P(X - 5, -40 + u, 4, 1, HC.wh); P(X - 4, -39 + u, 3, 1, HC.wh); P(X + 2, -40 + u, 4, 1, HC.wh); P(X + 2, -39 + u, 3, 1, HC.whS);
  P(X - 1, -38 + u, 3, 4, HC.O); P(X, -37 + u, 1, 2, HC.ruL); P(X + 1, -37 + u, 1, 2, HC.ru);
  // boyun
  P(X - 2, -44 + u, 4, 3, HC.O); P(X - 1, -44 + u, 2, 2, HC.skS);
  // saç (arka kütle, rüzgârla savrulur)
  const hx = X + 1, wind = m * 3 + Math.sin(t * 3) * 0.8;
  seg(hx - 4, -51 + u, hx - 6 - wind, -40 + u, 4, HC.ha, HC.O);
  seg(hx - 5 - wind, -45 + u, hx - 8 - wind, -38 + u, 3, HC.haS, HC.O);
  // baş
  P(hx - 4, -52 + u, 8, 10, HC.O); P(hx - 3, -51 + u, 6, 8, HC.sk);
  P(hx - 3, -44 + u, 6, 1, HC.skS); P(hx - 3, -51 + u, 1, 8, HC.skS);
  P(hx, -48 + u, 1, 1, '#2a1a14'); P(hx + 2, -48 + u, 1, 1, '#2a1a14');
  P(hx, -49 + u, 3, 1, HC.skS); P(hx + 2, -47 + u, 1, 2, HC.skS); P(hx, -45 + u, 2, 1, '#a0604a');
  // saç üstü + perçem
  P(hx - 5, -55 + u, 10, 4, HC.O); P(hx - 4, -55 + u, 8, 3, HC.ha); P(hx - 2, -55 + u, 4, 1, '#fff0b0');
  P(hx - 4, -52 + u, 2, 7, HC.ha); P(hx - 4, -46 + u, 1, 2, HC.haS); P(hx + 2, -52 + u, 2, 2, HC.ha);
  // ön omuzluk
  P(X + 4, -46 + u, 8, 9, HC.O); P(X + 5, -45 + u, 6, 7, HC.Y); P(X + 5, -45 + u, 6, 1, HC.HL);
  P(X + 5, -39 + u, 6, 1, HC.o); P(X + 7, -43 + u, 2, 2, HC.ru); P(X + 7, -43 + u, 1, 1, HC.ruL);
}
function drawBodyBack(m, t, u, lean, c) {
  const X = lean;
  drawLegs(c, u, m, t, true);
  P(-7, -27 + u, 6, 7, HC.O); P(-6, -26 + u, 4, 5, HC.y);
  P(1, -27 + u, 6, 7, HC.O); P(2, -26 + u, 4, 5, HC.o);
  // kollar
  const sw = Math.sin(t * 7) * m * 2;
  seg(X - 8, -38 + u, X - 9 + sw, -26 + u, 4, HC.y, HC.O);
  // sırt zırhı
  P(X - 7, -42 + u, 14, 14, HC.O); P(X - 6, -41 + u, 12, 12, HC.o); P(X - 6, -41 + u, 5, 11, HC.y);
  P(X - 6, -29 + u, 12, 2, HC.d);
  // omuzluklar
  P(X - 11, -45 + u, 7, 8, HC.O); P(X - 10, -44 + u, 5, 6, HC.y); P(X - 10, -44 + u, 5, 1, HC.Y);
  P(X + 4, -45 + u, 7, 8, HC.O); P(X + 5, -44 + u, 5, 6, HC.y); P(X + 5, -44 + u, 5, 1, HC.Y);
  // baş (arkadan saç)
  const hx = X, wind = Math.sin(t * 3) * 0.8;
  P(hx - 5, -55 + u, 10, 11, HC.O); P(hx - 4, -54 + u, 8, 9, HC.ha); P(hx - 2, -54 + u, 3, 1, '#fff0b0');
  P(hx - 3, -50 + u, 1, 6, HC.haS); P(hx + 1, -51 + u, 1, 6, HC.haS);
  seg(hx - 2, -45 + u, hx - 3 + wind, -37 + u, 5, HC.ha, HC.O);
  P(hx - 3 + Math.round(wind), -41 + u, 1, 4, HC.haS); P(hx - 1, -50 + u, 1, 5, HC.haS);
  drawCape(X, u, m * 0.6, t, true, true);
}

function drawSwordArm(sx, sy, ps) {
  const shx = sx + ps.shx, shy = sy + ps.shy, hx = sx + ps.hx, hy = sy + ps.hy;
  // kılıç izi (kombo savruluşu)
  const tr = hero.trail;
  if (tr.length > 1) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i];
      const al = Math.max(0, 1 - b.age / 0.12);
      ctx.fillStyle = `rgba(255,214,140,${(al * 0.55).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(sx + a.bx, sy + a.by); ctx.lineTo(sx + a.tx, sy + a.ty);
      ctx.lineTo(sx + b.tx, sy + b.ty); ctx.lineTo(sx + b.bx, sy + b.by); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,240,${al.toFixed(3)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx + a.tx, sy + a.ty); ctx.lineTo(sx + b.tx, sy + b.ty); ctx.stroke();
    }
    ctx.restore();
  }
  seg(shx, shy, hx, hy, 4, HC.y, HC.O);
  P(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4, HC.o);
  drawSword(swordSpr, Math.round(hx), Math.round(hy), ps.ang, 5, 3);
}

function drawHero(g) {
  const h = hero;
  if (!h.visible) return;
  const ghost = !!g;
  if (!ghost) for (const gh of h.ghosts) drawHero(gh);
  const px = ghost ? g.x : h.x, py = ghost ? g.y : h.y;
  const face = ghost ? g.face : h.face, back = ghost ? g.back : h.back;
  const t = ghost ? g.anim : h.anim;
  const m = ghost ? 1.3 : clamp(h.moveAmt, 0, 1.3);
  const sx = sX(px, py), sy = sY(px, py);
  const z = heroHover(h);
  const u = Math.round(h.crouch * 12);
  const lean = Math.round(m * 2);
  if (!ghost) shadow(sx, sy, 10 - Math.min(3, z / 3), 0.5);
  let alpha = 1;
  if (ghost) alpha = clamp(g.t / 0.3, 0, 1) * 0.4;
  else if (h.dead) alpha = 0.5;
  else if (h.invT > 0 && h.dashT <= 0 && Math.floor(time * 20) % 2 === 0) alpha = 0.6;
  ctx.globalAlpha = alpha;
  FL = ghost ? '#ffd76a' : (h.flash > 0 ? '#ffb0a0' : null);
  const ps = ghost ? null : heroSwordPose(h);
  const swordOn = !ghost && !h.dead && h.crouch < 0.95;
  if (swordOn && back) drawSwordArm(sx, sy, ps);

  const dashing = !ghost && h.dashT > 0;
  const flap = Math.sin(t * (dashing ? 22 : m > 0.25 ? 6.5 : 3.4)) * (dashing ? 4 : m > 0.25 ? 2.4 : 1.3);
  const sweep = m * 4 * face;
  ctx.save();
  ctx.translate(sx, sy - z);
  if (!back) {
    if (!ghost && h.haloA > 0) drawHalo(-59 + u, h.haloA);
    drawWing(-1, h.wingSpread, flap, u, sweep);
    drawWing(1, h.wingSpread, flap, u, sweep);
    ctx.scale(face, 1);
    drawBodyFront(m, t, u, lean, h.crouch, !ghost && h.castT > 0);
  } else {
    ctx.scale(face, 1);
    drawBodyBack(m, t, u, lean, h.crouch);
    ctx.scale(face, 1);
    drawWing(-1, h.wingSpread, flap, u, sweep);
    drawWing(1, h.wingSpread, flap, u, sweep);
    if (!ghost && h.haloA > 0) drawHalo(-59 + u, h.haloA);
  }
  ctx.restore();

  if (swordOn && !back) drawSwordArm(sx, sy, ps);
  // tabanca eli: omuzdan nişan yönüne uzanan kol + altın tabanca
  if (!ghost && h.castT > 0 && !h.dead) {
    const shx = sx - face * 7 + lean * face, shy = sy - z - 38 + u;
    const tx = sx + Math.round((h.castX - h.castY) * 16), ty = sy + Math.round((h.castX + h.castY) * 8) - Math.round(h.castZ);
    const ga = Math.atan2(ty - shy, tx - shx);
    const hx = Math.round(tx - Math.cos(ga) * 9), hy = Math.round(ty - Math.sin(ga) * 9);
    seg(shx, shy, hx, hy, 4, HC.y, HC.O);
    P(hx - 2, hy - 2, 4, 4, HC.o);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(ga);
    if (Math.cos(ga) < 0) ctx.scale(1, -1);
    ctx.drawImage(gunSpr, -2, -3);
    ctx.restore();
    if (h.muzzle > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const mx = Math.round(tx), my = Math.round(ty);
      P(mx - 3, my - 1, 7, 3, '#ffb040'); P(mx - 1, my - 3, 3, 7, '#ffb040'); P(mx - 1, my - 1, 3, 3, '#ffffff');
      ctx.restore();
      light(tx, ty, 50, 1, 'rgba(255,200,100,');
    }
  }
  FL = null;
  ctx.globalAlpha = 1;
}

function drawGhoul(e, sx, sy) {
  const t = e.anim;
  const walk = e.state === 'chase' ? Math.sin(t * 10) : 0;
  const atk = e.state === 'windup' ? 1 : 0;
  const O = '#120a0e', B = '#5d5566', S = '#3d3644', L = '#7d7488', E = '#ff2a2a';
  ctx.save(); ctx.translate(sx, sy); ctx.scale(e.face, 1);
  const l1 = Math.round(walk * 2), l2 = -l1;
  P(-4 + l1, -7, 3, 7, O); P(-3 + l1, -7, 1, 6, S);
  P(1 + l2, -7, 3, 7, O); P(2 + l2, -7, 1, 6, S);
  // gövde
  P(-6, -16, 11, 10, O); P(-5, -15, 9, 8, B); P(-5, -16, 8, 2, L);
  P(-3, -12, 6, 1, S); P(-3, -10, 6, 1, S);
  // baş
  P(1, -19, 7, 6, O); P(2, -18, 5, 4, L); P(4, -17, 1, 1, E); P(6, -17, 1, 1, E);
  P(3, -15, 4, 1, '#2a0a0a'); P(3, -15, 1, 1, '#ddd'); P(5, -15, 1, 1, '#ddd');
  // kollar
  if (atk) {
    P(-2, -26, 3, 11, O); P(-1, -25, 1, 9, B); P(-3, -27, 4, 2, '#ddd');
    P(4, -25, 3, 10, O); P(5, -24, 1, 8, B); P(4, -26, 4, 2, '#ddd');
  } else {
    const sw = Math.round(walk * 2);
    P(-7, -14 + sw, 3, 11, O); P(-6, -13 + sw, 1, 9, S); P(-7, -4 + sw, 3, 2, '#ccc');
    P(4, -13 - sw, 3, 11, O); P(5, -12 - sw, 1, 9, B); P(4, -3 - sw, 4, 2, '#ddd');
  }
  ctx.restore();
}
function drawWraith(e, sx, sy) {
  const t = e.anim;
  const z = Math.round(6 + Math.sin(t * 2.2) * 2);
  const R = '#2a1a2e', RD = '#160c18', RL = '#4a2e50';
  ctx.save(); ctx.translate(sx, sy - z); ctx.scale(e.face, 1);
  for (let r = 0; r < 20; r++) {
    const w = Math.round(3 + r * 0.42);
    P(-w - 1, -26 + r, w * 2 + 2, 1, '#06030a');
    P(-w, -26 + r, w * 2, 1, r < 3 ? RL : R);
    P(-w, -26 + r, 1, 1, RL);
  }
  for (let k = -4; k <= 4; k++) {
    const len = 2 + Math.round((Math.sin(t * 6 + k * 1.7) + 1) * 2);
    P(k * 2, -6, 2, len, k % 2 ? RD : R);
  }
  // başlık
  P(-6, -31, 12, 9, '#06030a'); P(-5, -30, 10, 7, RL); P(-4, -29, 8, 6, '#050205');
  const glow = e.state === 'cast' ? '#ff8a8a' : '#ff2a2a';
  P(-2, -27, 1, 1, glow); P(1, -27, 1, 1, glow);
  // kollar
  const cast = e.state === 'cast';
  P(4, cast ? -24 : -20, 4, 7, R); P(4, cast ? -24 : -20, 4, 1, RL);
  if (cast) {
    const pr = 2 + Math.round(Math.sin(time * 30));
    P(7 - pr, -26 - pr, pr * 2 + 1, pr * 2 + 1, '#ff2a3a'); P(7, -26, 1, 1, '#fff');
  }
  ctx.restore();
}
function drawBoss(e, sx, sy) {
  const t = e.anim;
  const sleeping = e.state === 'sleep';
  const O = '#0a0406', I = '#3a3238', IL = '#5a5058', ID = '#221c20', C = '#8a1020', CL = '#c02030';
  const walk = e.state === 'chase' ? Math.sin(t * 6) : 0;
  const breathe = Math.round(Math.sin(t * 1.5));
  ctx.save(); ctx.translate(sx, sy); ctx.scale(e.face, 1);
  if (sleeping) ctx.translate(0, 6);
  // pelerin
  P(-12, -44, 24, 42, O); P(-11, -43, 22, 40, '#4a0810');
  for (let k = -10; k < 11; k += 3) P(k, -4 + ((k + Math.floor(t * 3)) % 2) * 2, 2, 3, '#4a0810');
  // bacaklar
  const l = Math.round(walk * 3);
  P(-9 + l, -18, 7, 18, O); P(-8 + l, -17, 5, 16, I); P(-8 + l, -17, 1, 16, IL); P(-9 + l, -3, 7, 3, ID);
  P(2 - l, -18, 7, 18, O); P(3 - l, -17, 5, 16, I); P(7 - l, -17, 1, 16, ID); P(2 - l, -3, 7, 3, ID);
  // gövde
  P(-11, -40 + breathe, 22, 24, O); P(-10, -39 + breathe, 20, 22, I);
  P(-10, -39 + breathe, 20, 2, IL); P(-2, -36 + breathe, 4, 12, C); P(-1, -33 + breathe, 2, 3, '#ff3a3a');
  P(-10, -20, 20, 3, ID); P(-2, -20, 4, 3, C);
  // omuzlar + dikenler
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -18 : 9;
    P(x0, -44 + breathe, 9, 10, O); P(x0 + 1, -43 + breathe, 7, 8, I); P(x0 + 1, -43 + breathe, 7, 1, IL);
    P(x0 + 3, -49 + breathe, 2, 5, O); P(x0 + 3, -48 + breathe, 1, 4, IL);
    P(x0 + 3, -40 + breathe, 3, 2, C);
  }
  // kask
  P(-6, -53 + breathe, 12, 12, O); P(-5, -52 + breathe, 10, 10, I); P(-5, -52 + breathe, 10, 1, IL);
  P(-8, -57 + breathe, 2, 6, O); P(6, -57 + breathe, 2, 6, O); P(-9, -60 + breathe, 2, 4, IL); P(7, -60 + breathe, 2, 4, IL);
  const vis = sleeping ? '#3a0a0a' : (e.state === 'windup' || e.state === 'cast') ? '#ffd0a0' : '#ff2a2a';
  P(-4, -48 + breathe, 9, 2, vis);
  // kol
  P(-14, -36, 5, 14, O); P(-13, -35, 3, 12, I);
  ctx.restore();
  // kılıç
  let ang, hx = sx + e.face * 12, hy = sy - 24;
  if (sleeping) { ang = Math.PI / 2; hx = sx + e.face * 3; hy = sy - 20; }
  else if (e.state === 'windup') {
    const p = 1 - e.t / 0.75;
    ang = -Math.PI / 2 - e.face * (0.3 + p * 0.6); hy = sy - 40;
  } else if (e.state === 'recover') { ang = Math.atan2(((e.sx || 0) + (e.sy || 0)) * 8, ((e.sx || 1) - (e.sy || 0)) * 16); hy = sy - 20; }
  else if (e.state === 'cast') { ang = -Math.PI / 2; hy = sy - 44; hx = sx; }
  else ang = Math.PI / 2 - e.face * 0.5 + Math.sin(t * 2) * 0.05;
  drawSword(bossSwordSpr, Math.round(hx), Math.round(hy), ang, 6, 4);
}

function drawEnemy(e) {
  const sx = sX(e.x, e.y), sy = sY(e.x, e.y);
  if (e.dead) {
    const a = 1 - e.deathT / 0.7;
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.save(); ctx.translate(0, Math.round(e.deathT * 12));
  }
  shadow(sx, sy, e.type === 'boss' ? 18 : 7, e.type === 'wraith' ? 0.3 : 0.45);
  FL = e.flash > 0 ? '#ffffff' : null;
  if (e.type === 'ghoul') drawGhoul(e, sx, sy);
  else if (e.type === 'wraith') drawWraith(e, sx, sy);
  else drawBoss(e, sx, sy);
  FL = null;
  if (e.dead) { ctx.restore(); ctx.globalAlpha = 1; }
  // can barı (boss hariç)
  if (!e.dead && e.type !== 'boss' && e.hp < e.maxHp) {
    const w = 14, y = sy - (e.type === 'wraith' ? 40 : 26);
    P(sx - w / 2 - 1, y - 1, w + 2, 4, '#000');
    P(sx - w / 2, y, w, 2, '#3a050a');
    P(sx - w / 2, y, Math.max(1, Math.round(w * e.hp / e.maxHp)), 2, '#e0303a');
  }
}

// ---------------------------------------------------------
// ÇİZİM — nesneler
// ---------------------------------------------------------
function prepareObjectSprites() {
  for (const o of objects) {
    const seed = o.seed || (o.i * 131 + o.j * 71);
    if (o.kind === 'wall') { o.spr = wallSprite(o.h, o.win, seed); o.hgt = o.h; }
    else if (o.kind === 'pillar') { o.spr = pillarSprite(o.h, o.broken, seed); o.hgt = o.h; }
    else if (o.kind === 'tree') { o.spr = treeSprite(seed); o.hgt = 40; }
    else if (o.kind === 'grave') { o.spr = graveSprite(o.cross, seed); o.hgt = 14; }
    else if (o.kind === 'brazier') { o.spr = brazierSpr; o.hgt = 16; }
    else if (o.kind === 'altar') { o.spr = altarSpr; o.hgt = 12; altarObj = o; }
    else if (o.kind === 'shrine') { o.spr = shrineSpr; o.hgt = 16; }
    else if (o.kind === 'gate') { o.hgt = 34; gateObj = o; }
  }
}
function drawObject(o, hs) {
  const cx = sX(o.x, o.y), cy = sY(o.x, o.y);
  let alpha = 1;
  // kahramanın önündeyse saydamlaştır
  if (o.hgt > 20 && hero.visible && o.depth > hero.x + hero.y + 0.2) {
    const halfW = o.kind === 'wall' ? 18 : 10;
    if (Math.abs(cx - hs.x) < halfW + 6 && cy - o.hgt - 8 < hs.y && cy + 8 > hs.y - 36) alpha = 0.4;
  }
  o.alpha = lerp(o.alpha, alpha, 0.2);
  ctx.globalAlpha = o.alpha;
  switch (o.kind) {
    case 'wall': {
      const tx = sX(o.i, o.j), ty = sY(o.i, o.j);
      ctx.drawImage(o.spr, tx - 16, ty - o.h);
      break;
    }
    case 'brazier': {
      ctx.drawImage(o.spr, cx - o.spr.ax, cy - o.spr.ay);
      const fy = cy - o.spr.ay + 6;
      for (let k = 0; k < 7; k++) {
        const fh = 3 + Math.round((Math.sin(time * 12 + k * 1.9 + o.i) + 1) * 3 + Math.random() * 2);
        const x = cx - 5 + k + (k > 3 ? 1 : 0) + (k === 6 ? 1 : 0);
        P(x, fy - fh, 1, fh, '#c0401a');
        P(x, fy - fh + 2, 1, Math.max(1, fh - 3), '#ff8a2a');
        if (k > 1 && k < 5) P(x, fy - Math.max(1, fh - 3), 1, Math.max(1, fh - 4), '#ffe08a');
      }
      if (Math.random() < 0.12) addParticle({ x: o.x, y: o.y, z: 20, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, vz: 3 + Math.random() * 2, g: 0, life: 1.4, max: 1.4, c: Math.random() < 0.5 ? '#ff6a2a' : '#ffd060', add: true });
      break;
    }
    case 'altar': {
      ctx.drawImage(o.spr, cx - o.spr.ax, cy - o.spr.ay);
      if (o.shard) {
        const fy = Math.round(cy - 24 + Math.sin(time * 2) * 2);
        const pulse = (Math.sin(time * 4) + 1) / 2;
        P(cx - 3, fy - 5, 7, 11, '#2a0006');
        P(cx - 2, fy - 4, 5, 9, '#a0101e'); P(cx - 1, fy - 5, 3, 11, '#d0202e');
        P(cx, fy - 4, 1, 6, bossDead ? '#ffffff' : '#ff8a8a');
        if (bossDead && Math.random() < 0.3) addParticle({ x: o.x, y: o.y, z: 24, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), vz: 2, life: 0.9, max: 0.9, c: pulse > 0.5 ? '#ff4a5a' : '#ffffff', add: true });
      }
      break;
    }
    case 'shrine': {
      ctx.drawImage(o.spr, cx - o.spr.ax, cy - o.spr.ay);
      const ly = cy - o.spr.ay + 4;
      P(cx - 9, ly, 18, 2, o.active ? '#a0101e' : '#3a0a10');
      if (o.active) { P(cx - 6 + Math.round(Math.sin(time * 2) * 3), ly, 3, 1, '#ff6a7a'); }
      break;
    }
    case 'gate': {
      if (o.open) o.openT = Math.min(1, o.openT + 1 / 90);
      if (o.openT < 1) {
        const rise = Math.round(o.openT * 24);
        ctx.globalAlpha = o.alpha * (1 - o.openT);
        for (let k = 0; k <= 6; k++) {
          const wy = o.j + k / 6;
          const bx = sX(o.i + 0.5, wy), by = sY(o.i + 0.5, wy) - rise;
          P(bx, by - 34, 2, 34, '#0a0608'); P(bx, by - 34, 1, 34, '#5a5058');
          P(bx, by - 36, 2, 3, '#3a3238');
        }
        const x0 = sX(o.i + 0.5, o.j), y0 = sY(o.i + 0.5, o.j) - rise;
        ctx.strokeStyle = '#2a2428'; ctx.lineWidth = 2;
        for (const yy of [-30, -16]) { ctx.beginPath(); ctx.moveTo(x0, y0 + yy); ctx.lineTo(x0 - 16, y0 + yy + 8); ctx.stroke(); }
      }
      break;
    }
    default:
      ctx.drawImage(o.spr, cx - o.spr.ax, cy - o.spr.ay);
  }
  ctx.globalAlpha = 1;
}

// küçük piksel rakam fontu
const SLASH = '001001010100100';
const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function drawNumber(str, x, y, color, a = 1) {
  ctx.globalAlpha = a;
  const w = str.length * 4 - 1;
  let px = Math.round(x - w / 2);
  for (const ch of str) {
    const g = ch === '/' ? SLASH : DIG[+ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') {
      const gx = px + (i % 3), gy = Math.round(y) + ((i / 3) | 0);
      ctx.fillStyle = '#000'; ctx.fillRect(gx - 1, gy - 1, 3, 3);
    }
    px += 4;
  }
  px = Math.round(x - w / 2);
  for (const ch of str) {
    const g = ch === '/' ? SLASH : DIG[+ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') {
      ctx.fillStyle = color; ctx.fillRect(px + (i % 3), Math.round(y) + ((i / 3) | 0), 1, 1);
    }
    px += 4;
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------
// ÇİZİM — sahne
// ---------------------------------------------------------
const lights = [];
function light(x, y, r, a, color) { lights.push({ x, y, r, a, color }); }

function render() {
  lights.length = 0;
  const sh = shake > 0.2 ? shake : 0;
  cam.rx = Math.round(cam.x + (Math.random() - 0.5) * sh);
  cam.ry = Math.round(cam.y + (Math.random() - 0.5) * sh);

  // gökyüzü
  ctx.fillStyle = '#12030a'; ctx.fillRect(0, 0, VW, VH);
  const S = 256;
  const ox = -(((cam.rx * 0.2 + time * 4) % S) + S) % S, oy = -(((cam.ry * 0.2) % S) + S) % S;
  for (let y = oy; y < VH; y += S) for (let x = ox; x < VW; x += S) ctx.drawImage(skyCv, Math.round(x), Math.round(y));

  // zemin
  ctx.drawImage(floorCv, -OX - cam.rx, -OY - cam.ry);

  // krater kor çatlakları
  if (fx.craterGlow > 0.01) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const a = fx.craterGlow * (0.7 + Math.sin(time * 3) * 0.3);
    for (const line of craterCracks) {
      for (let k = 0; k < line.length; k++) {
        const f = 1 - k / line.length;
        ctx.fillStyle = `rgba(255,${(120 + f * 100) | 0},40,${(a * f).toFixed(3)})`;
        ctx.fillRect(line[k][0] - cam.rx, line[k][1] - cam.ry, 1, 1);
      }
    }
    ctx.restore();
    light(sX(START.x, START.y), sY(START.x, START.y), 70 * fx.craterGlow + 20, 0.8 * fx.craterGlow, 'rgba(255,140,40,');
  }

  // boss uyarı halkası
  if (boss && !boss.dead && boss.state === 'windup') {
    const px = boss.x + boss.sx * 1.1, py = boss.y + boss.sy * 1.1;
    const p = 1 - boss.t / 0.75;
    ctx.save();
    ctx.fillStyle = `rgba(200,20,30,${0.15 + p * 0.25})`;
    ctx.strokeStyle = `rgba(255,60,60,${0.5 + p * 0.5})`;
    ctx.beginPath(); ctx.ellipse(sX(px, py), sY(px, py), 2.2 * 22.6, 2.2 * 11.3, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (fx.shock) {
    const s = fx.shock, p = s.t / s.max;
    ctx.save(); ctx.strokeStyle = `rgba(255,${(200 - p * 150) | 0},120,${1 - p})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sX(s.x, s.y), sY(s.x, s.y), s.r * 22.6 * (0.3 + p), s.r * 11.3 * (0.3 + p), 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // toplanabilir gölgeleri
  // sıralı çizim
  const hs = heroScreen();
  const list = [];
  for (const o of objects) {
    const cx = sX(o.x, o.y), cy = sY(o.x, o.y);
    if (cx < -40 || cx > VW + 40 || cy < -10 || cy > VH + 80) continue;
    list.push({ d: o.depth, o });
    if (o.kind === 'brazier') light(cx, cy - 16, 62, 0.9, 'rgba(255,120,40,');
    if (o.kind === 'altar' && o.shard) light(cx, cy - 24, bossDead ? 70 : 40, 0.8, 'rgba(255,40,60,');
    if (o.kind === 'shrine' && o.active) light(cx, cy - 14, 40, 0.6, 'rgba(255,40,60,');
    if (o.kind === 'wall' && o.win && o.h >= 34) light(cx, cy - o.h / 2, 26, 0.35, 'rgba(255,90,30,');
  }
  for (const e of enemies) {
    const cx = sX(e.x, e.y), cy = sY(e.x, e.y);
    if (cx < -60 || cx > VW + 60 || cy < -20 || cy > VH + 90) continue;
    list.push({ d: e.x + e.y, e });
    if (!e.dead && e.type === 'wraith') light(cx, cy - 26, 18, 0.4, 'rgba(255,40,60,');
    if (!e.dead && e.type === 'boss' && e.state !== 'sleep') light(cx, cy - 48, 24, 0.5, 'rgba(255,40,40,');
  }
  for (const p of pickups) list.push({ d: p.x + p.y, p });
  if (hero.visible) list.push({ d: hero.x + hero.y, h: true });
  list.sort((a, b) => a.d - b.d);
  for (const it of list) {
    if (it.o) drawObject(it.o, hs);
    else if (it.e) drawEnemy(it.e);
    else if (it.p) drawPickup(it.p);
    else if (it.h) drawHero();
  }

  // mermiler
  for (const p of projectiles) {
    const x = sX(p.x, p.y), y = sY(p.x, p.y) - p.z;
    shadow(x, sY(p.x, p.y), 3, 0.3);
    if (p.owner === 'hero') {
      // mermi: hız yönünde parlak çizgi
      const dx = (p.vx - p.vy) * 16, dy = (p.vx + p.vy) * 8, m = Math.hypot(dx, dy) || 1;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 9; k++) { ctx.fillStyle = k < 2 ? '#ffffff' : k < 5 ? '#fff3b0' : 'rgba(255,180,80,0.5)'; ctx.fillRect(Math.round(x - dx / m * k), Math.round(y - dy / m * k), k < 2 ? 2 : 1, k < 2 ? 2 : 1); }
      ctx.restore();
      light(x, y, 18, 0.6, 'rgba(255,210,120,');
    } else {
      P(x - 2, y - 3, 5, 6, '#3a0a2a'); P(x - 3, y - 2, 7, 4, '#3a0a2a');
      P(x - 2, y - 2, 4, 4, '#ff2a3a'); P(x - 1, y - 1, 2, 2, '#ffb0b0');
      light(x, y, 22, 0.6, 'rgba(255,30,50,');
    }
  }

  // parçacıklar
  for (const p of particles) {
    const x = sX(p.x, p.y), y = sY(p.x, p.y) - Math.round(p.z);
    const a = clamp(p.life / p.max, 0, 1);
    if (p.add) { ctx.globalCompositeOperation = 'lighter'; }
    ctx.globalAlpha = a;
    ctx.fillStyle = p.c; ctx.fillRect(x, y, p.s, p.s);
    ctx.globalAlpha = 1;
    if (p.add) ctx.globalCompositeOperation = 'source-over';
  }

  // meteor
  if (meteor.active) drawMeteor();
  if (fx.pillar > 0.01) {
    const x = sX(START.x, START.y), y = sY(START.x, START.y);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const w = Math.round(10 + fx.pillar * 6);
    const g = ctx.createLinearGradient(0, 0, 0, y);
    g.addColorStop(0, 'rgba(255,220,140,0)'); g.addColorStop(1, `rgba(255,230,170,${fx.pillar * 0.7})`);
    ctx.fillStyle = g; ctx.fillRect(x - w, 0, w * 2, y);
    ctx.fillStyle = `rgba(255,255,230,${fx.pillar * 0.6})`; ctx.fillRect(x - 3, 0, 6, y);
    ctx.restore();
    light(x, y - 20, 120 * fx.pillar, fx.pillar, 'rgba(255,220,140,');
  }

  // kahraman ışığı
  if (hero.visible) light(hs.x, hs.y - 34, 82 + Math.sin(time * 2) * 3, 0.95, 'rgba(255,210,120,');
  if (hero.visible && hero.haloA > 0) light(hs.x, hs.y - 62, 28, 0.4 * hero.haloA, 'rgba(255,230,150,');

  // aydınlatma katmanı
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, VW, VH);
  lctx.fillStyle = 'rgba(14,0,6,0.52)';
  lctx.fillRect(0, 0, VW, VH);
  lctx.globalCompositeOperation = 'destination-out';
  for (const L of lights) {
    const g = lctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
    g.addColorStop(0, `rgba(0,0,0,${L.a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g; lctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
  }
  ctx.drawImage(lightCv, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    if (!L.color) continue;
    const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * 0.8);
    g.addColorStop(0, L.color + (0.16 * L.a).toFixed(3) + ')'); g.addColorStop(1, L.color + '0)');
    ctx.fillStyle = g; ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
  }
  ctx.restore();

  // hasar sayıları
  for (const n of numbers) drawNumber(String(n.val), sX(n.x, n.y), sY(n.x, n.y) - n.z, n.color, clamp(n.t * 2, 0, 1));

  // közler
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const e of embers) { ctx.globalAlpha = clamp(e.life / 3, 0, 0.8); ctx.fillStyle = e.c; ctx.fillRect(Math.round(e.x), Math.round(e.y), 1, 1); }
  ctx.restore(); ctx.globalAlpha = 1;

  ctx.drawImage(vignetteCv, 0, 0);

  if (fx.red > 0.01) { ctx.fillStyle = `rgba(160,0,10,${fx.red})`; ctx.fillRect(0, 0, VW, VH); }
  if (state === 'play' || state === 'dead') drawHUD();
  if (fx.flash > 0.01) { ctx.fillStyle = `rgba(255,248,225,${fx.flash})`; ctx.fillRect(0, 0, VW, VH); }
  if (fx.black > 0.001) { ctx.fillStyle = `rgba(5,0,2,${fx.black})`; ctx.fillRect(0, 0, VW, VH); }
}

function drawPickup(p) {
  const x = sX(p.x, p.y), y = sY(p.x, p.y);
  const z = Math.round(6 + Math.sin(time * 4 + p.x) * 2);
  shadow(x, y, 3, 0.35);
  P(x - 3, y - z - 3, 6, 6, '#3a0006'); P(x - 2, y - z - 2, 4, 4, '#e02030'); P(x - 1, y - z - 2, 1, 1, '#ffb0b0');
  light(x, y - z, 16, 0.5, 'rgba(255,40,60,');
}

function drawMeteor() {
  const p = clamp(meteor.t / meteor.dur, 0, 1);
  const ex = sX(START.x, START.y), ey = sY(START.x, START.y) - 10;
  const sx0 = ex + 110, sy0 = ey - VH;
  const e = p * p;
  const x = lerp(sx0, ex, e), y = lerp(sy0, ey, e);
  const dx = sx0 - ex, dy = sy0 - ey, d = Math.hypot(dx, dy);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 40; k++) {
    const f = k / 40;
    const tx = x + dx / d * k * 2.2, ty = y + dy / d * k * 2.2;
    ctx.fillStyle = `rgba(255,${(230 - f * 120) | 0},${(160 - f * 120) | 0},${(1 - f) * 0.9})`;
    const s = Math.max(1, Math.round((1 - f) * 5));
    ctx.fillRect(Math.round(tx - s / 2), Math.round(ty - s / 2), s, s);
  }
  ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
  ctx.restore();
  light(x, y, 90, 1, 'rgba(255,220,150,');
}

function drawOrb(cx, cy, r, frac, c1, c2, label) {
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8a6a2a'; ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1a0306'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  const top = cy + r - Math.round(frac * r * 2);
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(cx - r, top, r * 2, r * 2);
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.fillRect(cx - r, top, r * 2, 1);
  for (let k = 0; k < 3; k++) ctx.fillRect(cx - r + ((time * 20 + k * 13) % (r * 2)), top + 1, 2, 1);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(cx - r * 0.5, cy - r * 0.6, 3, 2);
  drawNumber(label, cx, cy + r + 5, '#e8d2b0');
}
function ammoFrac() { return hero.reloadT > 0 ? 1 - hero.reloadT / 1.1 : hero.ammo / hero.maxAmmo; }
function drawHUD() {
  const r = isTouch ? 12 : 17;
  const pad = 6;
  if (isTouch) {
    drawOrb(pad + r + 2, pad + r + 2, r, hero.hp / hero.maxHp, '#ff3a4a', '#6a0010', String(Math.ceil(hero.hp)));
    drawOrb(pad + r * 3 + 10, pad + r + 2, r, ammoFrac(), '#ffe07a', '#8a5a10', String(hero.ammo));
  } else {
    drawOrb(pad + r + 4, VH - pad - r - 10, r, hero.hp / hero.maxHp, '#ff3a4a', '#6a0010', String(Math.ceil(hero.hp)));
    drawOrb(VW - pad - r - 4, VH - pad - r - 10, r, ammoFrac(), '#ffe07a', '#8a5a10', String(hero.ammo));
  }
  // nişan imleci
  if (!isTouch && mouse.seen && state === 'play') {
    const x = Math.round(mouse.x), y = Math.round(mouse.y);
    P(x - 4, y, 3, 1, '#f6d36b'); P(x + 2, y, 3, 1, '#f6d36b'); P(x, y - 4, 1, 3, '#f6d36b'); P(x, y + 2, 1, 3, '#f6d36b');
  }
}

// ---------------------------------------------------------
// Kamera
// ---------------------------------------------------------
const camLead = { x: 0, y: 0 };
function updateCamera(dt, snap = false) {
  let lx = hero.vx * 0.25, ly = hero.vy * 0.25;
  if (!isTouch && mouse.seen && state === 'play') { lx += (mouse.x - VW / 2) * 0.12; ly += (mouse.y - VH / 2) * 0.12; }
  lx = clamp(lx, -42, 42); ly = clamp(ly, -30, 30);
  if (snap) { camLead.x = lx; camLead.y = ly; }
  const kl = Math.min(1, dt * 3);
  camLead.x += (lx - camLead.x) * kl; camLead.y += (ly - camLead.y) * kl;
  const tx = isoX(hero.x, hero.y) - VW / 2 + camLead.x;
  const ty = isoY(hero.x, hero.y) - VH / 2 - 26 + camLead.y;
  if (snap) { cam.x = tx; cam.y = ty; return; }
  const k = 1 - Math.pow(0.0004, dt);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
}

// ---------------------------------------------------------
// Arayüz yardımcıları
// ---------------------------------------------------------
let bannerTO = null, tipTO = null;
function banner(text, ms = 2500) {
  const b = $('banner'); b.textContent = text; b.classList.add('show');
  clearTimeout(bannerTO); bannerTO = setTimeout(() => b.classList.remove('show'), ms);
}
function tip(html, ms = 3000) {
  const t = $('tip'); t.innerHTML = html; t.classList.add('show');
  clearTimeout(tipTO); tipTO = setTimeout(() => t.classList.remove('show'), ms);
}
function objective(text) { $('objective').textContent = text; }

// Diyalog sistemi
const dlg = { active: false, full: '', i: 0, typing: false, res: null, timer: null };
function say(name, text, kind = 'hero') {
  return new Promise(res => {
    if (skipping) return res();
    const box = $('dialog');
    box.classList.add('show');
    box.classList.toggle('whisper', kind === 'whisper');
    $('dlg-portrait').classList.toggle('hidden', kind === 'none' || kind === 'friend');
    box.classList.toggle('friend', kind === 'friend');
    $('dlg-name').textContent = name;
    dlg.active = true; dlg.full = text; dlg.i = 0; dlg.typing = true; dlg.res = res;
    const el = $('dlg-text'); el.textContent = '';
    clearInterval(dlg.timer);
    dlg.timer = setInterval(() => {
      dlg.i++;
      el.textContent = dlg.full.slice(0, dlg.i);
      if (dlg.i % 3 === 0 && Sfx.ac && !skipping) Sfx.tone(kind === 'whisper' ? 180 : 320, 0.03, 'square', 0.015);
      if (dlg.i >= dlg.full.length) { dlg.typing = false; clearInterval(dlg.timer); }
    }, 32);
  });
}
function advanceDialog() {
  if (!dlg.active) return;
  if (dlg.typing) {
    dlg.typing = false; clearInterval(dlg.timer);
    $('dlg-text').textContent = dlg.full;
    return;
  }
  closeDialog();
}
function closeDialog() {
  dlg.active = false; clearInterval(dlg.timer);
  $('dialog').classList.remove('show');
  const r = dlg.res; dlg.res = null; r && r();
}
$('dialog').addEventListener('pointerdown', e => { e.stopPropagation(); advanceDialog(); });

// zamanlayıcılar ve geçişler
const tweens = [];
function wait(ms) {
  return new Promise(res => {
    if (skipping) return res();
    tweens.push({ wait: true, t: 0, ms, res });
  });
}
function tween(o, k, to, ms, ease = easeInOut) {
  return new Promise(res => {
    if (skipping || ms <= 0) { o[k] = to; return res(); }
    tweens.push({ o, k, from: o[k], to, ms, t: 0, ease, res });
  });
}
function updateTweens(dtms) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dtms;
    const p = Math.min(1, tw.t / tw.ms);
    if (!tw.wait) tw.o[tw.k] = tw.from + (tw.to - tw.from) * tw.ease(p);
    if (p >= 1 || skipping) {
      if (!tw.wait && skipping) tw.o[tw.k] = tw.to;
      tweens.splice(i, 1); tw.res();
    }
  }
}
async function cine(text, ms, red = false) {
  if (skipping) return;
  const c = $('cine-text');
  c.textContent = text; c.classList.toggle('red', red); c.classList.add('show');
  await wait(ms);
  c.classList.remove('show');
  await wait(900);
}

// ---------------------------------------------------------
// GİRİŞ SİNEMATİĞİ
// ---------------------------------------------------------
const HERO_NAME = '???';
async function runIntro() {
  state = 'intro';
  mode = 'iso';
  skipping = false;
  $('btn-skip').classList.add('show');
  fx.black = 1;
  hero.visible = false; hero.crouch = 1; hero.wingSpread = 0; hero.haloA = 0;
  hero.x = START.x; hero.y = START.y;
  updateCamera(0, true);
  cam.y -= 30;

  await wait(700);
  Sfx.heartbeat();
  await cine('. . .', 1500);
  Sfx.heartbeat();
  await cine('Karanlık.', 1700);
  Sfx.heartbeat();
  await cine('Sonra... bitmeyen bir düşüş.', 2100);
  Sfx.startAmbient();
  tween(fx, 'black', 0, 2600);
  tween(cam, 'y', cam.y + 30, 3500);
  await wait(2200);

  // gökten düşen ışık
  if (!skipping) {
    meteor.active = true; meteor.t = 0;
    Sfx.whistle();
  }
  await wait(1300);
  impact();
  await wait(2000);

  // ayağa kalkış
  await tween(hero, 'crouch', 0, 1700);
  Sfx.wings();
  for (let i = 0; i < 24 && !skipping; i++) addParticle({ x: hero.x + (Math.random() - 0.5), y: hero.y + (Math.random() - 0.5), z: 20 + Math.random() * 16, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: 3, g: 1.5, life: 1.4, max: 1.4, c: Math.random() < 0.85 ? '#f1ebe0' : '#a3162a', s: 2 });
  await tween(hero, 'wingSpread', 1, 900, easeOut);
  Sfx.chime();
  await tween(hero, 'haloA', 1, 800);
  await wait(500);

  await say(HERO_NAME, '...Neredeyim?');
  await say(HERO_NAME, 'Gökyüzü kan rengi. Toprak kül kokuyor... Burayı tanımıyorum.');
  await say(HERO_NAME, 'Adım... Adımı hatırlamıyorum. Nereden geldiğimi, kim olduğumu... hiçbir şeyi.');
  await say(HERO_NAME, 'Ama bu kılıç... Ellerim onu tanıyor. Bedenim savaşmayı unutmamış.');
  await say('Fısıltı', 'Demek uyandın... Düşmüş Olan.', 'whisper');
  await say('Fısıltı', 'Kuzeydeki katedrale gel. Kaybettiğin her şey orada seni bekliyor.', 'whisper');
  await say(HERO_NAME, 'Kimsin sen? ...Cevap ver!');
  await say(HERO_NAME, 'Sessizlik. Öyle olsun — cevapları kendim bulacağım.');

  if (!skipping) {
    $('title-card').classList.add('show');
    await wait(3600);
    $('title-card').classList.remove('show');
    await wait(800);
  }
  finishIntro();
}
function impact() {
  meteor.active = false;
  fx.craterGlow = 1;
  hero.visible = true;
  if (skipping) return;
  fx.flash = 1; tween(fx, 'flash', 0, 900);
  fx.pillar = 1; tween(fx, 'pillar', 0, 2600);
  shake = 14;
  Sfx.boom();
  burst(START.x, START.y, 6, 90, ['#fff3b0', '#ffb040', '#ff6a2a', '#ffffff'], 6, 9, 1.4, true, 6);
  burst(START.x, START.y, 2, 70, ['#4a3a36', '#2a1e1c', '#6a5a56'], 5, 4, 1.6, false, 5);
  fx.shock = { x: START.x, y: START.y, t: 0, max: 0.8, r: 5 };
}
function skipIntro() {
  if (state !== 'intro' || skipping) return;
  skipping = true;
  if (dlg.active) closeDialog();
  updateTweens(0);
}
function finishIntro() {
  skipping = false;
  tweens.length = 0;
  meteor.active = false;
  fx.black = 0; fx.flash = 0; fx.pillar = 0;
  fx.craterGlow = Math.max(fx.craterGlow, 0.6);
  hero.visible = true; hero.crouch = 0; hero.wingSpread = 1; hero.haloA = 1;
  $('cine-text').classList.remove('show');
  $('title-card').classList.remove('show');
  $('dialog').classList.remove('show');
  $('btn-skip').classList.remove('show');
  Sfx.startAmbient();
  state = 'play';
  playStart = performance.now();
  $('hud').classList.add('show');
  $('touch').classList.add('show');
  objective('Kuzeydeki yıkık katedrale ulaş');
  currentZone = null;
  setTimeout(() => {
    if (isTouch) tip('Sol taraf: <b>hareket</b> · <b>⚔</b> kılıç · <b>⌖</b> tabanca · <b>➶</b> kanat atılışı', 6500);
    else tip('<b>WASD</b> hareket · <b>Sol tık</b> kılıç · <b>Sağ tık</b> tabanca · <b>R</b> şarjör · <b>Boşluk</b> kanat atılışı', 6500);
  }, 2800);
}

// ---------------------------------------------------------
// FİNAL (Bölüm I sonu)
// ---------------------------------------------------------
async function runEnding() {
  state = 'dialog';
  mouse.l = mouse.r = false;
  Sfx.chime();
  fx.red = 0.8; tween(fx, 'red', 0, 1800);
  shake = 6;
  burst(altarObj.x, altarObj.y, 24, 60, ['#ff4a5a', '#ffffff', '#a0101e'], 3, 6, 1.4, true, 1);
  await wait(1200);
  await say('', '(Kırmızı kristal avucunda eriyor. Bir anı zihnine saplanıyor...)', 'none');
  fx.flash = 0.9; tween(fx, 'flash', 0, 1200);
  await say('Anı', 'Altın bir taht... Yanımda omuz omuza savaşan kardeşler... Ve bir yemin.', 'none');
  await say('Anı', 'Sonra ihanet. Kanla kaplanmış beyaz kanatlar. Ve gökyüzünden düşüş.', 'none');
  await say(HERO_NAME, 'Kardeşlerim... Bir ismim vardı. Bir ordum vardı.');
  await say('Fısıltı', 'Bir parça daha, Düşmüş Olan. Hatırladıkça... daha çok acıyacak.', 'whisper');
  await say(HERO_NAME, 'Acıya alışkınım. Hepsini hatırlayacağım.');
  state = 'end';
  const secs = Math.round((performance.now() - playStart) / 1000);
  $('end-stats').textContent = `Yok edilen düşman: ${kills}  ·  Süre: ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('end').classList.add('show');
  $('hud').classList.remove('show');
  $('touch').classList.remove('show');
}

// ---------------------------------------------------------
// Ölüm & yeniden doğuş
// ---------------------------------------------------------
function heroDie() {
  hero.dead = true;
  Sfx.die(); Sfx.boom();
  shake = 10;
  burst(hero.x, hero.y, 20, 50, ['#f1ebe0', '#a3162a', '#f6d36b'], 3, 6, 1.4, false, 4);
  setTimeout(() => {
    state = 'dead';
    $('dead').classList.add('show');
    $('touch').classList.remove('show');
  }, 1300);
}
function respawn() {
  $('dead').classList.remove('show');
  hero.dead = false; hero.hp = hero.maxHp; hero.ammo = hero.maxAmmo; hero.reloadT = 0; hero.invT = 1.5;
  hero.x = checkpoint.x; hero.y = checkpoint.y;
  projectiles.length = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    e.aggro = false; e.state = e.type === 'boss' ? 'sleep' : 'idle';
    e.x = e.hx; e.y = e.hy; e.kbx = e.kby = 0;
  }
  if (!bossDead && boss) {
    boss.hp = boss.maxHp; boss.summoned = false; boss.castCD = 5;
    bossWoke = false; $('boss').classList.remove('show');
    enemies = enemies.filter(e => !e.summon);
  }
  updateCamera(0, true);
  state = 'play';
  $('touch').classList.add('show');
  Sfx.chime();
  burst(hero.x, hero.y, 10, 30, GOLD, 2, 6, 1, true, 2);
  if (!bossDead && checkpoint === COURT_CP) objective('Kanlı Bekçi\'yi yok et');
}

// ---------------------------------------------------------
// Duraklatma
// ---------------------------------------------------------
function togglePause() {
  if (state === 'play' || state === 'plat') { prevState = state; state = 'paused'; $('pause').classList.add('show'); }
  else if (state === 'paused') { state = prevState; $('pause').classList.remove('show'); }
}

// ---------------------------------------------------------
// Ana döngü
// ---------------------------------------------------------
let last = performance.now();
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'plat') {
    if (state !== 'paused') { time += dt; updateTweens(dt * 1000); updatePlat(dt); shake = Math.max(0, shake - dt * 30); }
    renderPlat();
    requestAnimationFrame(frame);
    return;
  }
  if (state !== 'paused') {
    time += dt;
    updateTweens(dt * 1000);
    if (hitstop > 0) { hitstop -= dt; }
    else {
      if (state === 'play') {
        updateHero(dt);
        updateEnemies(dt);
        updateProjectiles(dt);
        updatePickups(dt);
        updateTriggers();
      } else {
        hero.anim += dt;
        for (const e of enemies) e.anim += dt;
      }
      updateParticles(dt);
      if (meteor.active) meteor.t += dt;
      if (fx.shock) { fx.shock.t += dt; if (fx.shock.t > fx.shock.max) fx.shock = null; }
      if (state === 'play' || state === 'dialog' || state === 'dead') updateCamera(dt);
      if (state === 'play') fx.craterGlow = Math.max(0.25, fx.craterGlow - dt * 0.02);
      fx.red = Math.max(0, fx.red - dt * 1.2);
      shake = Math.max(0, shake - dt * 30);
    }
    if (boss && bossWoke && !bossDead) $('boss-fill').style.width = (Math.max(0, boss.hp) / boss.maxHp * 100) + '%';
  }
  if (state !== 'title') render();
  else renderTitleBg();
  requestAnimationFrame(frame);
}
function renderTitleBg() {
  ctx.fillStyle = '#0b0205'; ctx.fillRect(0, 0, VW, VH);
}

// =========================================================
// PROLOG — yan görünüşlü platform bölümü (yağmur, nehir, mağara)
// =========================================================
let mode = 'iso'; // 'plat' | 'iso'
let LEGW = null;   // platform yürüyüş bacak pozu (drawLegs bunu kullanır)
const LV = { W: 3560, caveX: 2860, babyX: 3430, floor: -116 };
const solids = [];
const waters = [
  { x0: 1100, x1: 1170, top: 60 },
  { x0: 1500, x1: 1820, top: 18 },
];
function S(x, y, w, h, kind) { const s = { x, y, w, h, kind }; solids.push(s); return s; }
S(-260, -420, 60, 840, 'wall');
S(-200, 0, 1300, 420, 'ground');
S(800, -30, 60, 30, 'ledge');
S(860, -62, 70, 62, 'ledge');
S(1170, 0, 330, 420, 'ground');
S(1820, 0, 360, 420, 'ground');
S(2180, -36, 90, 456, 'ground');
S(2270, -74, 90, 494, 'ground');
S(2360, -116, 1400, 536, 'cliff');
S(380, -22, 30, 22, 'rock');
S(600, -18, 64, 18, 'log');
S(1300, -28, 36, 28, 'rock');
S(1556, -2, 46, 60, 'stone');
const mlog = S(1640, 6, 70, 14, 'mlog'); mlog.x0 = 1618; mlog.x1 = 1700; mlog.dir = 1; mlog.dx = 0;
S(1752, -2, 46, 60, 'stone');
S(1960, -26, 96, 26, 'trunk');
S(2560, -140, 34, 24, 'rock');
S(3050, -136, 22, 20, 'stalag');
S(3200, -144, 26, 28, 'stalag');
S(3540, -420, 220, 840, 'wall');

const CHECKS = [{ x: 60 }, { x: 1440 }, { x: 2420 }];
const FEATHER_POS = [[250, -40], [300, -52], [350, -40], [610, -52], [895, -100], [1010, -40], [1135, -50], [1330, -64],
  [1580, -40], [1670, -30], [1775, -40], [2005, -60], [2225, -72], [2315, -110], [2480, -150], [2700, -150], [2950, -150], [3120, -175]];

const PL = { x: 60, y: 0, vx: 0, vy: 0, w: 12, h: 50, face: 1, onGround: false, ground: null, coyote: 0, jumpBuf: 0, jumpHeld: false, cut: false,
  phase: 0, anim: 0, dead: false, deadT: 0, check: 0, landT: 0, wasGround: false };
const FR = { x: 20, y: 0, vx: 0, face: 1, phase: 0, onGround: true, hist: [] };
const pl = { feathers: [], got: 0, camX: 0, camY: -200, look: 0, flash: 0, bolt: null, nextBolt: 4, rain: [], splash: [], parts: [], cine: 0, fade: 0, babyWake: 0, triggers: {}, cut: false, active: false, inCave: 0 };
let levelCv = null, stormCv = null, ridgeFar = null, ridgeMid = null;
const LVTOP = -340; // seviye tuvalinin dünya y başlangıcı

function groundTopAt(x, fromY = -1000) {
  let best = 1e9;
  for (const s of solids) if (s.kind !== 'wall' && x >= s.x && x <= s.x + s.w && s.y >= fromY && s.y < best) best = s.y;
  return best;
}

function makeStorm() {
  const Sz = 256, r = mulberry32(21);
  function grid(gx, gy) { const a = []; for (let i = 0; i < gx * gy; i++) a.push(r()); return { gx, gy, a }; }
  const layers = [grid(4, 6), grid(8, 12), grid(16, 24)], wts = [0.55, 0.3, 0.15];
  const sm = t => t * t * (3 - 2 * t);
  const sample = (G, u, v) => {
    const x = u * G.gx, y = v * G.gy, x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
    const at = (i, j) => G.a[((j % G.gy) + G.gy) % G.gy * G.gx + ((i % G.gx) + G.gx) % G.gx];
    return lerp(lerp(at(x0, y0), at(x0 + 1, y0), fx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), fx), fy);
  };
  const pal = [[10, 10, 20], [16, 15, 30], [24, 22, 42], [34, 30, 56], [46, 40, 70], [60, 52, 86]];
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return mk(Sz, Sz, g => {
    const img = g.createImageData(Sz, Sz), d = img.data;
    for (let y = 0; y < Sz; y++) for (let x = 0; x < Sz; x++) {
      let n = 0; for (let l = 0; l < 3; l++) n += sample(layers[l], x / Sz, y / Sz) * wts[l];
      n = clamp((n - 0.3) / 0.55, 0, 1);
      const lv = clamp(Math.floor(n * 5.6 + bayer[(x & 3) + (y & 3) * 4] / 16 - 0.3), 0, 5);
      const c = pal[lv], o = (y * Sz + x) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
function makeRidge(seed, h, base, amp, col, trees) {
  const W = 1024, r = mulberry32(seed);
  const waves = [];
  for (let k = 0; k < 6; k++) waves.push({ f: [1, 2, 3, 5, 8, 13][k], a: amp / (k + 1.2), p: r() * TAU });
  return mk(W, h, g => {
    g.fillStyle = col;
    const tops = [];
    for (let x = 0; x < W; x++) {
      let y = base;
      for (const w of waves) y += Math.sin(x / W * TAU * w.f + w.p) * w.a;
      y = Math.round(y); tops.push(y);
      g.fillRect(x, y, 1, h - y);
    }
    if (trees) for (let n = 0; n < 26; n++) {
      const x = Math.floor(r() * W), y = tops[x], th = 10 + Math.floor(r() * 18);
      g.fillRect(x, y - th, 2, th);
      for (let b = 0; b < 4; b++) { const by = y - th + 3 + b * 3, bl = 2 + Math.floor(r() * 5); g.fillRect(r() < 0.5 ? x - bl : x + 2, by, bl, 1); }
    }
  });
}
function buildLevelCanvas() {
  const W = LV.W + 40, H = 760;
  const r = mulberry32(77);
  levelCv = mk(W, H, g => {
    const Y = y => y - LVTOP;
    // mağara arka duvarı
    for (let x = LV.caveX; x < LV.W; x++) for (let y = -330; y < LV.floor; y += 2) {
      const n = r();
      g.fillStyle = n < 0.08 ? '#241e2a' : n < 0.5 ? '#16121a' : '#1b161f';
      g.fillRect(x, Y(y), 1, 2);
    }
    // mağara tavanı ve sarkıtlar
    for (let x = LV.caveX - 40; x < LV.W + 40; x++) {
      const edge = x < LV.caveX ? Math.round(-250 - (LV.caveX - x) * 1.8) : -250 + Math.round(Math.sin(x * 0.05) * 4 + r() * 3);
      for (let y = -420; y < edge; y += 2) { g.fillStyle = r() < 0.2 ? '#3a3236' : '#2a2428'; g.fillRect(x, Y(y), 1, 2); }
      g.fillStyle = '#4a4246'; g.fillRect(x, Y(edge) - 1, 1, 1);
    }
    for (let k = 0; k < 22; k++) {
      const x = LV.caveX + 20 + Math.floor(r() * (LV.W - LV.caveX - 40)), len = 8 + Math.floor(r() * 26);
      for (let i = 0; i < len; i++) { const w = Math.max(1, Math.round((1 - i / len) * 5)); g.fillStyle = i % 5 === 0 ? '#3e3639' : '#2e282b'; g.fillRect(x - (w >> 1), Y(-252 + i), w, 1); }
    }
    // mağara ağzı kenarı (kaya kemer)
    for (let y = -330; y < LV.floor; y++) {
      const t = (y + 330) / (LV.floor + 330);
      const w = Math.round(18 + Math.sin(t * 9) * 4 + (1 - t) * 20);
      for (let x = 0; x < w; x++) { g.fillStyle = x > w - 3 ? '#4a4246' : r() < 0.2 ? '#3a3236' : '#2e282b'; g.fillRect(LV.caveX - 10 + x, Y(y), 1, 1); }
    }
    // katılar
    for (const s of solids) {
      if (s.kind === 'mlog' || s.kind === 'wall') continue;
      drawSolid(g, s, Y, r);
    }
  });
}
function drawSolid(g, s, Y, r) {
  const x0 = Math.round(s.x), y0 = Y(s.y), w = s.w, h = Math.min(s.h, 420);
  if (s.kind === 'ground' || s.kind === 'ledge' || s.kind === 'cliff') {
    const rocky = s.kind === 'cliff';
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y += 2) {
      const n = r();
      let c;
      if (y < 4) c = y === 0 ? '#6a9a5e' : n < 0.3 ? '#3a5e3e' : '#4e7a4a';
      else if (rocky) c = n < 0.06 ? '#6a6268' : n < 0.5 ? '#3e3a42' : '#48404c';
      else c = n < 0.05 ? '#6a5a4c' : n < 0.5 ? '#3e3028' : '#4a382e';
      if (y > 4 && (Math.floor((y + x * 0.3) / 14) % 3 === 0) && n < 0.4) c = rocky ? '#28242a' : '#2a1e1a';
      g.fillStyle = c; g.fillRect(x0 + x, y0 + y, 1, 2);
    }
    // ot tutamları
    for (let k = 0; k < w / 6; k++) { const x = x0 + Math.floor(r() * w), hh = 2 + Math.floor(r() * 4); g.fillStyle = r() < 0.5 ? '#4e7a4a' : '#3a5e3e'; g.fillRect(x, y0 - hh, 1, hh); }
    // yan kenar gölgesi
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x0, y0 + 4, 2, h - 4); g.fillRect(x0 + w - 2, y0 + 4, 2, h - 4);
  } else if (s.kind === 'rock' || s.kind === 'stalag') {
    for (let y = 0; y < s.h; y++) {
      const t = y / s.h;
      const inset = s.kind === 'stalag' ? Math.round((1 - t) * w * 0.38) : Math.round(Math.max(0, (0.35 - t)) * w * 0.6);
      for (let x = inset; x < w - inset; x++) {
        const edge = x === inset || x === w - inset - 1 || y === 0;
        const n = r();
        g.fillStyle = edge ? '#18141a' : x < w * 0.4 ? (n < 0.2 ? '#7a7280' : '#625a68') : (n < 0.2 ? '#4a4450' : '#3e3842');
        g.fillRect(x0 + x, y0 + y, 1, 1);
      }
    }
    if (s.kind === 'rock') { g.fillStyle = '#3a5e3e'; g.fillRect(x0 + 4, y0 + 1, Math.round(w * 0.4), 2); }
  } else if (s.kind === 'log' || s.kind === 'trunk') {
    g.fillStyle = '#140c08'; g.fillRect(x0, y0, w, s.h);
    g.fillStyle = '#4a3020'; g.fillRect(x0 + 1, y0 + 1, w - 2, s.h - 2);
    g.fillStyle = '#5e3e28'; g.fillRect(x0 + 1, y0 + 1, w - 2, 3);
    for (let x = 4; x < w - 4; x += 7) { g.fillStyle = '#3a2418'; g.fillRect(x0 + x, y0 + 4 + (x % 3), 4, 1); }
    g.fillStyle = '#7a5a3a'; g.fillRect(x0 + w - 6, y0 + 2, 4, s.h - 4);
    g.fillStyle = '#5a4028'; g.fillRect(x0 + w - 5, y0 + Math.round(s.h / 2) - 1, 2, 2);
    g.fillStyle = '#3a5e3e'; g.fillRect(x0 + 6, y0, 10, 1);
  } else if (s.kind === 'stone') {
    for (let y = 0; y < 30; y++) for (let x = 0; x < w; x++) {
      const inset = y < 3 ? 3 - y : 0;
      if (x < inset || x >= w - inset) continue;
      g.fillStyle = y < 2 ? '#8a8a90' : x < w * 0.35 ? '#5e5e66' : '#44444c';
      if (y > 18) g.fillStyle = '#2a2a32';
      g.fillRect(x0 + x, y0 + y, 1, 1);
    }
    g.fillStyle = '#3a5e3e'; g.fillRect(x0 + 6, y0 + 3, 8, 2);
  }
}

// ---------- karakter çizimleri (yan görünüş) ----------
function drawWalkLegs(u) {
  const { phase, run, air, vy } = LEGW;
  const hipY = -22 + u;
  for (const i of [0, 1]) {
    const back = i === 0;
    let fx, fy, kx, ky;
    if (air) {
      if (back) { fx = -5; fy = vy > 120 ? 0 : -3; kx = -1; ky = -11; }
      else { fx = 5; fy = vy > 120 ? -3 : -7; kx = 7; ky = -14; }
    } else {
      const p = phase + (back ? Math.PI : 0);
      fx = (back ? -1 : 1) + Math.sin(p) * 7 * run;
      fy = -Math.max(0, -Math.cos(p)) * 5 * run;
      kx = ((back ? -2 : 2) + fx) / 2 + 2.5; ky = (hipY + fy) / 2;
    }
    const hx = back ? -2 : 2;
    const col = back ? HC.o : HC.y, hl = back ? HC.y : HC.Y;
    seg(hx, hipY, kx, ky, 5, col, HC.O);
    seg(kx, ky, fx, fy - 2, 4, col, HC.O);
    P(Math.round(kx) - 1, Math.round(ky) - 1, 3, 3, hl); P(Math.round(kx), Math.round(ky), 1, 1, HC.ru);
    P(Math.round(fx) - 2, Math.round(fy) - 3, 6, 3, HC.O); P(Math.round(fx) - 1, Math.round(fy) - 2, 5, 2, HC.o);
  }
}
function drawPlatHero(sx, sy) {
  const p = PL;
  const run = clamp(Math.abs(p.vx) / 165, 0, 1);
  LEGW = { phase: p.phase, run, air: !p.onGround, vy: p.vy };
  if (p.onGround) shadow(sx, sy, 9, 0.35);
  const bob = p.onGround ? -Math.round(Math.abs(Math.sin(p.phase)) * 1.5 * run) : 0;
  const squash = p.landT > 0 ? 2 : 0;
  ctx.save();
  ctx.translate(sx, sy + bob + squash);
  // sırttaki kın içinde kılıç
  ctx.save(); ctx.scale(p.face, 1); drawSword(swordSpr, -3, -44, 2.25, 5, 3); ctx.restore();
  drawWing(-1, 0.1, Math.sin(p.anim * 2) * 0.5, 0, run * 3 * p.face);
  drawWing(1, 0.1, Math.sin(p.anim * 2) * 0.5, 0, run * 3 * p.face);
  ctx.scale(p.face, 1);
  drawBodyFront(run * 0.9, p.anim, 0, Math.round(run * 2), 0, false);
  // ön kol (koşarken sallanır)
  const lean = Math.round(run * 2);
  const sw = p.onGround ? -Math.sin(p.phase) * 5 * run : -4;
  seg(6 + lean, -38, 8 + lean + sw * 0.3, -31, 4, HC.y, HC.O);
  seg(8 + lean + sw * 0.3, -31, 9 + lean + sw, -25 + (p.onGround ? 0 : -6), 4, HC.o, HC.O);
  ctx.restore();
  LEGW = null;
}
function drawFriend(sx, sy) {
  const f = FR, run = clamp(Math.abs(f.vx) / 165, 0, 1), O = '#0c0a08';
  const CL = '#2e3a34', CLL = '#46564c', CLD = '#1a2420';
  ctx.save(); ctx.translate(sx, sy); ctx.scale(f.face, 1);
  if (f.onGround) shadow(0, 0, 8, 0.3);
  // bacaklar
  for (const i of [0, 1]) {
    const pp = f.phase + i * Math.PI;
    const fx = (i ? 1 : -1) + (f.onGround ? Math.sin(pp) * 6 * run : (i ? 4 : -3));
    const fy = f.onGround ? -Math.max(0, -Math.cos(pp)) * 4 * run : -4;
    seg(i ? 2 : -2, -20, (fx + (i ? 2 : -2)) / 2 + 2, -10, 4, i ? '#4a3a2a' : '#3a2c20', O);
    seg((fx + (i ? 2 : -2)) / 2 + 2, -10, fx, fy - 2, 4, i ? '#4a3a2a' : '#3a2c20', O);
    P(Math.round(fx) - 2, Math.round(fy) - 3, 6, 3, O); P(Math.round(fx) - 1, Math.round(fy) - 2, 5, 2, '#2a1a10');
  }
  // pelerin
  for (let y = -40; y <= -12; y++) {
    const t = (y + 40) / 28;
    const l = Math.round(lerp(-6, -9 - run * 6, t)), rr = Math.round(lerp(6, 7 - run * 4, t));
    P(l - 1, y, rr - l + 2, 1, O); P(l, y, rr - l, 1, t > 0.9 ? CLD : CL); P(l, y, 2, 1, CLL);
  }
  P(-3, -30, 7, 2, '#5a3a22'); // kemer
  // kol + fener
  const sw = Math.sin(f.phase) * 2 * run;
  seg(3, -36, 7, -29 + sw, 4, CL, O);
  seg(7, -29 + sw, 10, -24 + sw, 3, '#d8a07a', O);
  const lx = 9, ly = Math.round(-24 + sw);
  P(lx - 1, ly, 1, 3, O);
  P(lx - 3, ly + 2, 7, 8, O); P(lx - 2, ly + 3, 5, 6, (Math.random() < 0.1 ? '#ffe9a8' : '#ffc860')); P(lx - 2, ly + 3, 5, 1, '#5a3a22'); P(lx - 3, ly + 9, 7, 1, '#5a3a22');
  // baş (başlık)
  P(-5, -51, 11, 12, O); P(-4, -50, 9, 10, CL); P(-4, -50, 9, 2, CLL);
  P(0, -47, 5, 7, '#d8a07a'); P(0, -47, 5, 1, '#3a2418'); P(3, -45, 1, 1, '#1a0e08'); P(0, -42, 4, 1, '#b07a58');
  P(-4, -40, 9, 2, CLD);
  ctx.restore();
}
function drawBaby(sx, sy) {
  const t = time, wake = pl.babyWake;
  // yuva
  for (let y = -6; y <= 0; y++) for (let x = -20; x <= 20; x++) {
    const q = (x * x) / 400 + ((y + 3) * (y + 3)) / 12;
    if (q > 1) continue;
    P(sx + x, sy + y, 1, 1, (x + y * 3) % 4 === 0 ? '#c9b48a' : (x % 3 === 0 ? '#8a7450' : '#a89068'));
  }
  for (let k = 0; k < 9; k++) { const x = sx - 18 + k * 4.5; P(Math.round(x), sy - 7 - (k % 2), 3, 2, '#f1ebe0'); P(Math.round(x) + 2, sy - 6, 1, 1, '#a3162a'); }
  const by = sy - 9 + Math.round(Math.sin(t * 2) * 0.6);
  // minik kanatlar
  const fl = Math.round(Math.sin(t * 6) * 1 * (0.4 + wake));
  for (const s of [-1, 1]) { P(sx + s * 7 - (s < 0 ? 4 : 0), by - 6 + fl, 5, 4, '#24140a'); P(sx + s * 7 - (s < 0 ? 3 : -1), by - 5 + fl, 3, 2, '#f1ebe0'); }
  // gövde (kundak)
  P(sx - 7, by - 6, 14, 8, '#24140a'); P(sx - 6, by - 5, 12, 6, '#f1ebe0'); P(sx - 6, by - 1, 12, 1, '#c9c0b2');
  P(sx - 1, by - 4, 2, 2, '#d8a63a');
  // baş
  P(sx + 3, by - 9, 7, 7, '#24140a'); P(sx + 4, by - 8, 5, 5, '#e9b893');
  P(sx + 4, by - 10, 4, 2, '#f2d27a'); P(sx + 6, by - 11, 2, 1, '#f2d27a');
  if (wake > 0.5) { P(sx + 5, by - 6, 1, 1, '#d8a63a'); P(sx + 7, by - 6, 1, 1, '#d8a63a'); }
  else { P(sx + 5, by - 6, 1, 1, '#b67d5c'); P(sx + 7, by - 6, 1, 1, '#b67d5c'); }
  // minik hale
  ctx.globalAlpha = 0.5 + wake * 0.5;
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; P(Math.round(sx + 6 + Math.cos(a) * 4), Math.round(by - 13 + Math.sin(a) * 1.2), 1, 1, '#f6d36b'); }
  ctx.globalAlpha = 1;
  light(sx + 2, by - 6, 60 + wake * 140 + Math.sin(t * 3) * 6, 0.9, 'rgba(255,220,150,');
  if (Math.random() < 0.15 + wake) pl.parts.push({ x: LV.babyX + (Math.random() - 0.5) * 30, y: LV.floor - 10, vx: (Math.random() - 0.5) * 10, vy: -20 - Math.random() * 30, life: 1.5, max: 1.5, c: Math.random() < 0.6 ? '#ffe8a0' : '#ffffff', add: true, g: 0 });
}
function drawFeather(sx, sy, t) {
  const b = Math.round(Math.sin(t * 3 + sx) * 2);
  P(sx - 1, sy - 6 + b, 3, 9, '#5a3a12'); P(sx, sy - 5 + b, 2, 7, '#f1ebe0'); P(sx, sy - 5 + b, 1, 7, '#ffffff');
  P(sx + 1, sy + 2 + b, 1, 2, '#d8a63a');
  light(sx, sy + b, 14, 0.5, 'rgba(255,230,160,');
}

// ---------- prolog akışı ----------
function startPrologue() {
  mode = 'plat';
  state = 'platcut';
  VIEW_TARGET = 225; resize();
  pl.active = true;
  if (!levelCv) { buildLevelCanvas(); stormCv = makeStorm(); ridgeFar = makeRidge(5, 200, 70, 30, '#141220', false); ridgeMid = makeRidge(9, 200, 110, 18, '#0d0b14', true); }
  pl.feathers = FEATHER_POS.map(([x, y]) => ({ x, y, got: false }));
  pl.got = 0; pl.triggers = {}; pl.babyWake = 0; pl.fade = 1;
  respawnPlat(0, true);
  $('btn-skip').classList.add('show');
  $('touch').classList.add('plat');
  Sfx.startRain();
  runPrologueIntro();
}
async function runPrologueIntro() {
  await wait(600);
  if (!pl.active) return;
  const c = $('cine-text');
  c.textContent = 'Fırtınalı bir gece...'; c.classList.remove('red'); c.classList.add('show');
  await wait(2200); c.classList.remove('show');
  if (!pl.active) return;
  tween(pl, 'fade', 0, 1800);
  await wait(1600);
  if (!pl.active) return;
  await say('Arin', 'Gökyüzü yarıldı sanki! Bu yağmur dinecek gibi değil, kardeşim.', 'friend');
  if (!pl.active) return;
  await say('Arin', 'Tepedeki mağarayı görüyor musun? Oraya sığınalım. Çabuk!', 'friend');
  if (!pl.active) return;
  state = 'plat';
  $('hud').classList.add('show');
  $('touch').classList.add('show');
  objective('Yağmurdan kaçmak için tepedeki mağaraya ulaş');
  tip(isTouch ? 'Sol taraf: <b>yürü</b> · <b>⤒</b> zıpla' : '<b>A / D</b> yürü · <b>Boşluk</b> zıpla (basılı tutarsan daha yükseğe)', 5000);
}
async function runPrologueEnding() {
  state = 'platcut'; pl.cut = true;
  PL.vx = 0;
  $('touch').classList.remove('show');
  await wait(400);
  await say('Arin', 'Şşş... Duydun mu? Mağaranın derinliklerinden bir ses geliyor.', 'friend');
  if (!pl.active) return;
  await say('Arin', 'Bir bebek! Burada, bu soğukta... Kim bırakır bir bebeği buraya?', 'friend');
  if (!pl.active) return;
  await say(HERO_NAME, 'Şu altın saçlar... Şu minicik kanatlar... Bu yüzü tanıyorum.');
  if (!pl.active) return;
  await say(HERO_NAME, 'Bu... benim, Arin. Bu bebek benim.');
  if (!pl.active) return;
  await say('Arin', 'Ne diyorsun sen? Kardeşim, iyi misin? Yüzün bembeyaz oldu...', 'friend');
  if (!pl.active) return;
  Sfx.chime();
  tween(pl, 'babyWake', 1, 1500);
  await wait(1600);
  if (!pl.active) return;
  await say('Fısıltı', 'Hatırla... Nereden düştüğünü hatırla.', 'whisper');
  if (!pl.active) return;
  Sfx.boom();
  pl.flash = 0; await tween(pl, 'flash', 1, 1400);
  endPrologue();
}
function skipPrologue() {
  if (!pl.active) return;
  if (dlg.active) closeDialog();
  endPrologue();
}
function endPrologue() {
  if (!pl.active) return;
  pl.active = false;
  Sfx.stopRain();
  $('bubble').classList.remove('show');
  $('cine-text').classList.remove('show');
  $('touch').classList.remove('plat', 'show');
  $('hud').classList.remove('show');
  mode = 'iso';
  VIEW_TARGET = 320; resize();
  runIntro();
}
function respawnPlat(ci, first) {
  const c = CHECKS[ci];
  PL.x = c.x; PL.y = groundTopAt(c.x); PL.vx = PL.vy = 0; PL.dead = false; PL.face = 1;
  FR.x = c.x - 34; FR.y = groundTopAt(c.x - 34); FR.vx = 0; FR.face = 1; FR.hist = [];
  if (!first) { pl.fade = 1; tween(pl, 'fade', 0, 500); }
  pl.camX = clamp(PL.x - VW / 2, 0, LV.W - VW); pl.camY = PL.y - VH * 0.66;
}

function overlap(e, s) {
  return e.x - e.w / 2 < s.x + s.w && e.x + e.w / 2 > s.x && e.y - e.h < s.y + s.h && e.y > s.y;
}
function updatePlat(dt) {
  pl.flashL = Math.max(0, (pl.flashL || 0) - dt * 2.5);
  // hareketli kütük
  const ox = mlog.x;
  mlog.x += mlog.dir * 34 * dt;
  if (mlog.x > mlog.x1) { mlog.x = mlog.x1; mlog.dir = -1; } if (mlog.x < mlog.x0) { mlog.x = mlog.x0; mlog.dir = 1; }
  mlog.dx = mlog.x - ox;
  mlog.y = 6 + Math.sin(time * 2) * 1.5;
  // şimşek
  pl.nextBolt -= dt;
  if (pl.nextBolt <= 0 && pl.inCave < 0.5) {
    pl.nextBolt = 5 + Math.random() * 6;
    pl.flashL = 1;
    const x = Math.random() * VW;
    const pts = [[x, 0]]; let bx = x;
    for (let y = 0; y < VH * 0.45; y += 6) { bx += (Math.random() - 0.5) * 12; pts.push([bx, y]); }
    pl.bolt = { pts, t: 0.18 };
    setTimeout(() => Sfx.thunder(), 250 + Math.random() * 600);
  }
  if (pl.bolt) { pl.bolt.t -= dt; if (pl.bolt.t <= 0) pl.bolt = null; }

  const p = PL;
  p.anim += dt; p.landT -= dt;
  if (state === 'plat' && !p.dead) {
    let ax = 0;
    if (keys.a || keys.arrowleft) ax -= 1;
    if (keys.d || keys.arrowright) ax += 1;
    if (joy.active && Math.abs(joy.x) > 0.2) ax = clamp(joy.x * 1.3, -1, 1);
    const jumpHeld = !!(keys[' '] || keys.w || keys.arrowup || touch.jump);
    if (jumpHeld && !p.jumpHeld) p.jumpBuf = 0.13;
    p.jumpHeld = jumpHeld;
    p.jumpBuf -= dt;
    const target = ax * 165;
    const acc = p.onGround ? (ax ? 1500 : 1900) : 950;
    if (p.vx < target) p.vx = Math.min(target, p.vx + acc * dt); else if (p.vx > target) p.vx = Math.max(target, p.vx - acc * dt);
    if (ax) p.face = ax > 0 ? 1 : -1;
    p.coyote = p.onGround ? 0.1 : p.coyote - dt;
    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = -440; p.jumpBuf = 0; p.coyote = 0; p.onGround = false; p.cut = false;
      Sfx.jump();
      for (let i = 0; i < 6; i++) pl.parts.push({ x: p.x + (Math.random() - 0.5) * 10, y: p.y, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30, life: 0.4, max: 0.4, c: '#6a5a50', g: 200 });
    }
    // değişken zıplama yüksekliği
    const grav = (p.vy < 0 && !jumpHeld) ? 3200 : (p.vy < 0 ? 1450 : 1700);
    p.vy = Math.min(720, p.vy + grav * dt);
  } else if (!p.dead) {
    const acc = 1900; p.vx = p.vx > 0 ? Math.max(0, p.vx - acc * dt) : Math.min(0, p.vx + acc * dt);
    p.vy = Math.min(720, p.vy + 1700 * dt);
  }
  if (!p.dead) {
    if (p.onGround && p.ground === mlog) p.x += mlog.dx;
    p.x += p.vx * dt;
    for (const s of solids) if (overlap(p, s)) {
      if (p.vx > 0 || (p.vx === 0 && p.x < s.x + s.w / 2)) p.x = s.x - p.w / 2 - 0.01; else p.x = s.x + s.w + p.w / 2 + 0.01;
      p.vx = 0;
    }
    p.y += p.vy * dt;
    p.wasGround = p.onGround; p.onGround = false;
    for (const s of solids) if (overlap(p, s)) {
      if (p.vy >= 0) { p.y = s.y; p.onGround = true; p.ground = s; if (!p.wasGround && p.vy > 250) { p.landT = 0.08; Sfx.land(); for (let i = 0; i < 5; i++) pl.parts.push({ x: p.x + (Math.random() - 0.5) * 12, y: p.y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 30, life: 0.35, max: 0.35, c: '#6a5a50', g: 200 }); } p.vy = 0; }
      else { p.y = s.y + s.h + p.h; p.vy = 0; }
    }
    if (p.onGround && Math.abs(p.vx) > 5) p.phase += Math.abs(p.vx) * dt * 0.075;
    else if (p.onGround) p.phase = lerp(p.phase, Math.round(p.phase / Math.PI) * Math.PI, Math.min(1, dt * 10));
    // suya / çukura düşme
    for (const w of waters) if (p.x > w.x0 && p.x < w.x1 && p.y > w.top + 6) killPlat(w);
    if (p.y > 320) killPlat(null);
    // kontrol noktası
    for (let i = CHECKS.length - 1; i > p.check; i--) if (p.x > CHECKS[i].x) { p.check = i; break; }
  } else {
    p.deadT -= dt;
    if (p.deadT <= 0) respawnPlat(p.check);
  }

  // arkadaş: oyuncunun izini takip eder
  if (!p.dead) {
    const H = FR.hist, last = H[H.length - 1];
    if (!last || Math.abs(last.x - p.x) + Math.abs(last.y - p.y) > 0.6) H.push({ x: p.x, y: p.y, g: p.onGround });
    if (H.length > 400) H.splice(0, H.length - 400);
    let dist = 0, k = H.length - 1;
    while (k > 0 && dist < 36) { dist += Math.hypot(H[k].x - H[k - 1].x, H[k].y - H[k - 1].y); k--; }
    if (dist >= 36 && k >= 0) {
      const tgt = H[k];
      const dx = tgt.x - FR.x;
      FR.vx = dx / Math.max(dt, 0.001);
      FR.x = tgt.x; FR.y = tgt.y; FR.onGround = tgt.g;
      if (Math.abs(dx) > 0.05) FR.face = dx > 0 ? 1 : -1;
      if (FR.onGround) FR.phase += Math.abs(dx) * 0.075;
      H.splice(0, k);
    } else { FR.vx = 0; FR.onGround = true; }
  }

  // tüyler
  for (const f of pl.feathers) if (!f.got && Math.abs(f.x - p.x) < 12 && f.y > p.y - p.h - 6 && f.y < p.y + 6) {
    f.got = true; pl.got++; Sfx.pickup();
    for (let i = 0; i < 10; i++) pl.parts.push({ x: f.x, y: f.y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0.5, max: 0.5, c: '#fff3b0', add: true, g: 0 });
  }

  // tetikleyiciler
  const T = pl.triggers;
  if (!T.pit && p.x > 960) { T.pit = 1; bubble('Dikkat! Toprak kaymış, çukura düşme!'); }
  if (!T.river && p.x > 1400) { T.river = 1; bubble('Nehir taşmış! Taşların ve kütüğün üstünden atla!'); objective('Nehri taşların üstünden atlayarak geç'); }
  if (!T.climb && p.x > 2100) { T.climb = 1; bubble('Mağara şu kayalıkların tepesinde. Tırman!'); objective('Kayalıklara tırman, mağaraya gir'); }
  if (!T.cave && p.x > LV.caveX + 20) { T.cave = 1; bubble('Oh be... Sonunda kuru bir yer.'); objective('Mağaranın derinliklerini keşfet'); }
  if (!T.end && p.x > LV.babyX - 90 && state === 'plat') { T.end = 1; runPrologueEnding(); }
  pl.inCave = lerp(pl.inCave, p.x > LV.caveX ? 1 : 0, Math.min(1, dt * 2));
  Sfx.setRain(1 - pl.inCave * 0.8);

  // kamera
  pl.look = lerp(pl.look, p.face * 50, Math.min(1, dt * 2));
  const tx = clamp(p.x - VW / 2 + pl.look, 0, LV.W - VW + 10);
  const ty = p.y - VH * 0.64;
  pl.camX += (tx - pl.camX) * Math.min(1, dt * 6);
  pl.camY += (ty - pl.camY) * Math.min(1, dt * 4);

  // parçacıklar
  for (let i = pl.parts.length - 1; i >= 0; i--) {
    const q = pl.parts[i]; q.life -= dt;
    if (q.life <= 0) { pl.parts.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.vy += (q.g || 0) * dt;
  }
  // yağmur
  const want = Math.round(220 * (1 - pl.inCave * 0.95) * (VW / 640));
  while (pl.rain.length < want) pl.rain.push({ x: Math.random() * (VW + 60), y: Math.random() * VH - VH, v: 380 + Math.random() * 160, l: 5 + Math.random() * 6 });
  if (pl.rain.length > want) pl.rain.length = want;
  for (const d of pl.rain) {
    d.y += d.v * dt; d.x -= d.v * 0.18 * dt;
    const wx = d.x + pl.camX, gy = groundTopAt(wx, -1000) - pl.camY;
    if (d.y > gy || d.y > VH) {
      if (d.y > gy && gy < VH && Math.random() < 0.35 && wx < LV.caveX) pl.splash.push({ x: d.x, y: gy, t: 0.18 });
      d.y = -10 - Math.random() * 40; d.x = Math.random() * (VW + 60);
    }
  }
  for (let i = pl.splash.length - 1; i >= 0; i--) { pl.splash[i].t -= dt; if (pl.splash[i].t <= 0) pl.splash.splice(i, 1); }
  updateBubblePos();
}
function killPlat(w) {
  const p = PL;
  if (p.dead) return;
  p.dead = true; p.deadT = 0.9;
  if (w) { Sfx.splash(); for (let i = 0; i < 24; i++) pl.parts.push({ x: p.x + (Math.random() - 0.5) * 14, y: w.top, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 160, life: 0.8, max: 0.8, c: Math.random() < 0.5 ? '#8ab0d0' : '#c8e0f0', g: 600 }); }
  else Sfx.hurt();
  bubble(w ? 'Kardeşim! Tut elimi!' : 'Dikkatli ol!');
}

// konuşma balonu (arkadaşın başının üstünde)
let bubbleTO = null;
function bubble(text, ms = 3200) {
  const b = $('bubble'); b.textContent = text; b.classList.add('show');
  clearTimeout(bubbleTO); bubbleTO = setTimeout(() => b.classList.remove('show'), ms);
}
function updateBubblePos() {
  const b = $('bubble');
  if (!b.classList.contains('show')) return;
  const x = (FR.x - pl.camX) * SCALE / DPR, y = (FR.y - 60 - pl.camY) * SCALE / DPR;
  b.style.left = clamp(x, 110, innerWidth - 110) + 'px'; b.style.top = Math.max(60, y) + 'px';
}

function renderPlat() {
  lights.length = 0;
  const sh = shake > 0.2 ? shake : 0;
  const cx = Math.round(pl.camX + (Math.random() - 0.5) * sh), cy = Math.round(pl.camY + (Math.random() - 0.5) * sh);
  // gökyüzü
  ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, 0, VW, VH);
  const so = -(((cx * 0.1 + time * 6) % 256) + 256) % 256;
  for (let y = 0; y < VH; y += 256) for (let x = so; x < VW; x += 256) ctx.drawImage(stormCv, Math.round(x), y);
  if (pl.flashL > 0) { ctx.fillStyle = `rgba(200,210,255,${pl.flashL * 0.35})`; ctx.fillRect(0, 0, VW, VH); }
  if (pl.bolt) {
    ctx.strokeStyle = '#e8ecff'; ctx.lineWidth = 2; ctx.beginPath();
    pl.bolt.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  }
  // tepeler (paralaks)
  const ridge = (cv2, f, baseY) => {
    const ox = -(((cx * f) % 1024) + 1024) % 1024;
    const y = Math.round(baseY - (cy + VH * 0.64) * f);
    for (let x = ox; x < VW; x += 1024) ctx.drawImage(cv2, Math.round(x), y);
    ctx.fillStyle = cv2 === ridgeFar ? '#141220' : '#0d0b14';
    ctx.fillRect(0, y + 199, VW, VH);
  };
  ridge(ridgeFar, 0.15, VH * 0.18);
  ridge(ridgeMid, 0.4, VH * 0.32);
  // seviye
  ctx.drawImage(levelCv, -cx, LVTOP - cy);
  // su
  for (const w of waters) {
    const x0 = Math.round(w.x0 - cx), x1 = Math.round(w.x1 - cx), y0 = Math.round(w.top - cy);
    if (x1 < 0 || x0 > VW) continue;
    ctx.fillStyle = '#0e1a2e'; ctx.fillRect(x0, y0, x1 - x0, VH);
    ctx.fillStyle = '#1a2e4a'; ctx.fillRect(x0, y0 + 2, x1 - x0, 6);
    for (let x = x0; x < x1; x++) {
      const wy = Math.round(Math.sin((x + cx) * 0.12 + time * 4) * 1.2);
      ctx.fillStyle = '#4a7aa0'; ctx.fillRect(x, y0 + wy, 1, 1);
      if (((x + cx + Math.floor(time * 30)) % 23) === 0) { ctx.fillStyle = '#9ac0e0'; ctx.fillRect(x, y0 + wy + 1, 3, 1); }
    }
    for (let k = 0; k < 6; k++) { const xx = x0 + ((k * 53 + Math.floor(time * 40)) % Math.max(1, x1 - x0)); ctx.fillStyle = '#2a4a6a'; ctx.fillRect(xx, y0 + 4 + (k % 3) * 3, 6, 1); }
  }
  // hareketli kütük
  { const s = mlog, x0 = Math.round(s.x - cx), y0 = Math.round(s.y - cy);
    ctx.fillStyle = '#140c08'; ctx.fillRect(x0, y0, s.w, s.h);
    ctx.fillStyle = '#4a3020'; ctx.fillRect(x0 + 1, y0 + 1, s.w - 2, s.h - 2);
    ctx.fillStyle = '#5e3e28'; ctx.fillRect(x0 + 1, y0 + 1, s.w - 2, 3);
    ctx.fillStyle = '#7a5a3a'; ctx.fillRect(x0 + s.w - 6, y0 + 2, 4, s.h - 4);
    ctx.fillStyle = '#9ac0e0'; ctx.fillRect(x0 - 2, y0 + s.h - 3, 3, 1); ctx.fillRect(x0 + s.w, y0 + s.h - 3, 3, 1); }
  // tüyler
  for (const f of pl.feathers) if (!f.got) drawFeather(Math.round(f.x - cx), Math.round(f.y - cy), time);
  // bebek, arkadaş, kahraman
  drawBaby(Math.round(LV.babyX - cx), Math.round(LV.floor - cy));
  drawFriend(Math.round(FR.x - cx), Math.round(FR.y - cy));
  light(Math.round(FR.x - cx) + 9 * FR.face, Math.round(FR.y - cy) - 18, 70 + Math.random() * 4, 0.9, 'rgba(255,190,90,');
  if (!PL.dead) drawPlatHero(Math.round(PL.x - cx), Math.round(PL.y - cy));
  light(Math.round(PL.x - cx), Math.round(PL.y - cy) - 30, 70, 0.6, 'rgba(255,220,150,');
  // parçacıklar
  for (const q of pl.parts) {
    ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
    if (q.add) ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = q.c; ctx.fillRect(Math.round(q.x - cx), Math.round(q.y - cy), 1, 1);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
  // yağmur
  ctx.fillStyle = 'rgba(170,190,230,0.45)';
  for (const d of pl.rain) {
    if (d.x + cx > LV.caveX - 6 && d.y > (-250 - cy)) continue;
    for (let i = 0; i < d.l; i++) ctx.fillRect(Math.round(d.x + i * 0.18), Math.round(d.y - i), 1, 1);
  }
  ctx.fillStyle = 'rgba(190,210,240,0.6)';
  for (const s of pl.splash) { ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 1, 1); ctx.fillRect(Math.round(s.x) + 1, Math.round(s.y) - 1, 1, 1); ctx.fillRect(Math.round(s.x), Math.round(s.y) - 2, 1, 1); }
  // aydınlatma
  const amb = lerp(0.22, 0.62, pl.inCave) * (1 - pl.flashL * 0.6);
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, VW, VH);
  lctx.fillStyle = `rgba(4,4,12,${amb.toFixed(3)})`; lctx.fillRect(0, 0, VW, VH);
  lctx.globalCompositeOperation = 'destination-out';
  for (const L of lights) {
    const g = lctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
    g.addColorStop(0, `rgba(0,0,0,${L.a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g; lctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
  }
  ctx.drawImage(lightCv, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    if (!L.color) continue;
    const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * 0.8);
    g.addColorStop(0, L.color + (0.14 * L.a).toFixed(3) + ')'); g.addColorStop(1, L.color + '0)');
    ctx.fillStyle = g; ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
  }
  ctx.restore();
  ctx.drawImage(vignetteCv, 0, 0);
  // HUD: tüy sayacı
  if (state === 'plat' || state === 'platcut') {
    const x = 10, y = isTouch ? 30 : 20;
    P(x - 1, y - 1, 5, 11, '#000'); P(x, y, 2, 9, '#f1ebe0'); P(x + 2, y + 1, 1, 7, '#c9c0b2'); P(x + 1, y + 8, 1, 2, '#d8a63a');
    drawNumber(pl.got + '/' + pl.feathers.length, x + 16, y + 2, '#f6d36b');
  }
  if (pl.flash > 0.01) { ctx.fillStyle = `rgba(255,250,230,${pl.flash})`; ctx.fillRect(0, 0, VW, VH); }
  if (pl.fade > 0.01) { ctx.fillStyle = `rgba(0,0,0,${pl.fade})`; ctx.fillRect(0, 0, VW, VH); }
}

// ---------------------------------------------------------
// Başlatma
// ---------------------------------------------------------
buildMap();
prepareObjectSprites();
buildFloorCache();
spawnEnemies();
$('title').classList.add('show');

$('btn-start').addEventListener('click', () => {
  Sfx.init();
  $('title').classList.remove('show');
  if (isTouch) goFullscreen();
  startPrologue();
});
$('btn-skip').addEventListener('click', e => { e.stopPropagation(); if (mode === 'plat') skipPrologue(); else skipIntro(); });
$('btn-respawn').addEventListener('click', () => respawn());
$('btn-again').addEventListener('click', () => location.reload());
$('btn-resume').addEventListener('click', () => togglePause());
$('btn-mute').addEventListener('click', e => {
  Sfx.init();
  const m = Sfx.toggleMute();
  e.currentTarget.textContent = m ? '✕' : '♪';
});
$('btn-full').addEventListener('click', () => goFullscreen(true));
function goFullscreen(toggle) {
  const d = document;
  if (toggle && (d.fullscreenElement || d.webkitFullscreenElement)) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
  const el = d.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) {
    const p = req.call(el);
    if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {});
  }
}
addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });

requestAnimationFrame(frame);

// hata ayıklama için
window.__game = { PL: () => PL, pl: () => pl, mode: () => mode, ts: (x, y) => ({ x: sX(x, y) * SCALE / DPR, y: (sY(x, y) - 20) * SCALE / DPR }), hs: () => { const s = heroScreen(); return { x: s.x * SCALE / DPR, y: s.y * SCALE / DPR, k: SCALE / DPR }; }, hero, enemies: () => enemies, state: () => state, skipIntro, get boss() { return boss; } };
})();
