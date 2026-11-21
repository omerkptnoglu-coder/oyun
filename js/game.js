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

function resize() {
  DPR = window.devicePixelRatio || 1;
  const pw = Math.round(innerWidth * DPR), ph = Math.round(innerHeight * DPR);
  const target = 320;
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
  swing() { this.noise(0.2, 0.35, 600, 3500, 'bandpass', 1.5); },
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
const touch = { sword: false, fire: false, dash: false };
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
  hp: 100, maxHp: 100, mana: 100, maxMana: 100,
  face: 1, aimX: 1, aimY: 0, anim: 0, moving: false,
  atkT: 0, atkCD: 0, atkDur: 0.28, castT: 0, castX: 0, castY: 0, castZ: 26, hitDone: true, swingA0: 0, swingA1: 0,
  fireCD: 0, dashT: 0, dashCD: 0, dashX: 0, dashY: 0,
  invT: 0, flash: 0, visible: false, crouch: 1, wingSpread: 0, haloA: 0, dead: false,
};

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
  // ekran ve dünya yönünü belirle
  if (!isTouch && mouse.seen) {
    const hs = heroScreen();
    let dx = mouse.x - hs.x, dy = mouse.y - (hs.y - 16);
    if (Math.hypot(dx, dy) < 1) dx = hero.face;
    const w = screenDirToWorld(dx, dy);
    return { sx: dx, sy: dy, wx: w.x, wy: w.y };
  }
  const t = nearestEnemy(range);
  let wx, wy;
  if (t) { const d = Math.hypot(t.x - hero.x, t.y - hero.y) || 1; wx = (t.x - hero.x) / d; wy = (t.y - hero.y) / d; }
  else { wx = hero.aimX; wy = hero.aimY; }
  return { sx: (wx - wy) * 16, sy: (wx + wy) * 8, wx, wy };
}

function updateHero(dt) {
  const h = hero;
  h.anim += dt;
  h.atkCD -= dt; h.castT -= dt; h.fireCD -= dt; h.dashCD -= dt; h.invT -= dt; h.flash -= dt;
  h.mana = Math.min(h.maxMana, h.mana + 5 * dt);
  if (h.dead) return;

  // hareket girdisi (ekran yönü)
  let mx = 0, my = 0;
  if (keys.a || keys.arrowleft) mx -= 1;
  if (keys.d || keys.arrowright) mx += 1;
  if (keys.w || keys.arrowup) my -= 1;
  if (keys.s || keys.arrowdown) my += 1;
  if (joy.active) { mx = joy.x; my = joy.y; }
  const mag = Math.hypot(mx, my);
  h.moving = false;
  let wdx = 0, wdy = 0;
  if (mag > 0.18) {
    const w = screenDirToWorld(mx * 2, my); // ekranda yatay hareket 2 kat piksel alır
    wdx = w.x; wdy = w.y;
    h.aimX = w.x; h.aimY = w.y;
    h.moving = true;
    if (h.atkT <= 0 && Math.abs(mx) > 0.1) h.face = mx > 0 ? 1 : -1;
  }

  // atılış
  if ((keys[' '] || keys.shift || touch.dash) && h.dashCD <= 0) {
    const dir = h.moving ? { x: wdx, y: wdy } : { x: h.aimX, y: h.aimY };
    h.dashX = dir.x; h.dashY = dir.y; h.dashT = 0.2; h.dashCD = 0.85; h.invT = Math.max(h.invT, 0.25);
    Sfx.dash();
    for (let i = 0; i < 10; i++) addParticle({ x: h.x, y: h.y, z: 14 + Math.random() * 14, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: 4, g: 2, life: 0.8, max: 0.8, c: Math.random() < 0.8 ? '#f1ebe0' : '#a3162a', s: 2 });
  }
  if (h.dashT > 0) {
    h.dashT -= dt;
    moveEnt(h, h.dashX * 13 * dt, h.dashY * 13 * dt);
    if (Math.random() < 0.6) addParticle({ x: h.x, y: h.y, z: 10 + Math.random() * 20, life: 0.4, max: 0.4, c: '#f6d36b', s: 1, add: true });
  } else if (h.moving) {
    const sp = 4.3 * Math.min(1, mag) * (h.atkT > 0 ? 0.45 : 1);
    moveEnt(h, wdx * sp * dt, wdy * sp * dt);
  }

  // kılıç
  if ((mouse.l || touch.sword || keys.j) && h.atkCD <= 0 && h.dashT <= 0) {
    const a = computeAim(3.5);
    const ang = Math.atan2(a.sy, a.sx);
    h.face = a.sx >= 0 ? 1 : -1;
    h.aimX = a.wx; h.aimY = a.wy;
    h.swingA0 = ang - 1.8 * h.face; h.swingA1 = ang + 1.6 * h.face;
    h.atkT = h.atkDur; h.atkCD = 0.36; h.hitDone = false;
    Sfx.swing();
  }
  if (h.atkT > 0) {
    h.atkT -= dt;
    if (!h.hitDone && h.atkT < h.atkDur - 0.07) { h.hitDone = true; swordHit(); }
  }

  // kutsal ateş
  if ((mouse.r || touch.fire || keys.k) && h.fireCD <= 0 && h.dashT <= 0) {
    if (h.mana >= 18) {
      const a = computeAim(11);
      h.face = a.sx >= 0 ? 1 : -1;
      h.aimX = a.wx; h.aimY = a.wy;
      h.mana -= 18; h.fireCD = 0.42;
      // el, göğüs hizasından nişan yönüne uzanır; ateş tam elden çıkar
      const sm = Math.hypot(a.sx, a.sy) || 1;
      const k = 0.55;
      const cz = clamp(30 - (a.sy / sm) * 11 + (a.wx + a.wy) * 8 * k, 14, 44);
      h.castT = 0.3; h.castX = a.wx * k; h.castY = a.wy * k; h.castZ = cz;
      projectiles.push({ owner: 'hero', x: h.x + a.wx * k, y: h.y + a.wy * k, z: cz, vx: a.wx * 9.5, vy: a.wy * 9.5, life: 1.3, dmg: 30, r: 0.35 });
      Sfx.fire();
      burst(h.x + a.wx * k, h.y + a.wy * k, cz, 10, GOLD, 1.5, 2, 0.3, true, 0);
    } else if (h.fireCD <= 0) {
      h.fireCD = 0.4; Sfx.nomana();
      tip(isTouch ? 'Mana yetersiz — kılıçla vurarak mana kazan' : 'Mana yetersiz — <b>kılıçla vurarak</b> mana kazan', 2200);
    }
  }

  // Kanat tüyü / hale parıltısı
  if (Math.random() < dt * 3) addParticle({ x: h.x + (Math.random() - 0.5) * 0.6, y: h.y + (Math.random() - 0.5) * 0.6, z: 30 + Math.random() * 12, vz: 3, g: 0, life: 1.2, max: 1.2, c: '#ffe8a0', s: 1, add: true });
}

function swordHit() {
  const h = hero;
  let any = false;
  for (const e of enemies) {
    if (e.dead || e.state === 'sleep') continue;
    const dx = e.x - h.x, dy = e.y - h.y, d = Math.hypot(dx, dy);
    if (d > 1.75 + e.r) continue;
    const dot = d > 0.01 ? (dx * h.aimX + dy * h.aimY) / d : 1;
    if (dot < 0.15 && d > 0.7) continue;
    const dmg = 22 + Math.random() * 12;
    damageEnemy(e, dmg, dx / (d || 1), dy / (d || 1), 5);
    any = true;
  }
  if (any) {
    Sfx.hit(); hitstop = 0.06; shake = Math.max(shake, 3);
    h.mana = Math.min(h.maxMana, h.mana + 5);
  }
}

function damageEnemy(e, dmg, nx, ny, kb) {
  if (e.dead) return;
  e.hp -= dmg; e.flash = 0.12;
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
  h.hp -= dmg; h.invT = 0.6; h.flash = 0.2;
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
      if (Math.random() < 0.9) addParticle({ x: p.x, y: p.y, z: p.z + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), vz: 2, life: 0.35, max: 0.35, c: GOLD[(Math.random() * 4) | 0], add: true });
    }
    if (!hit && p.owner === 'enemy') {
      if (!hero.dead && Math.hypot(hero.x - p.x, hero.y - p.y) < hero.r + p.r) {
        damageHero(p.dmg, p.vx, p.vy); hit = true;
      }
      if (Math.random() < 0.6) addParticle({ x: p.x, y: p.y, z: p.z, vz: 1, life: 0.4, max: 0.4, c: Math.random() < 0.5 ? '#ff2a3a' : '#6a0a2a', add: true });
    }
    if (hit) {
      if (p.owner === 'hero') {
        Sfx.explode();
        burst(p.x, p.y, p.z, 22, GOLD, 3, 4, 0.5, true, 4);
        // sıçrama hasarı
        for (const e of enemies) {
          if (e.dead || e.state === 'sleep') continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < 1.4 && d > e.r + p.r) damageEnemy(e, 12, (e.x - p.x) / (d || 1), (e.y - p.y) / (d || 1), 3);
        }
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
    if (z.id === 'graves' && !tipsShown.graves) { tipsShown.graves = true; tip('Hortlaklar uzaktan saldırır — <b>atılışla</b> kaç, <b>kutsal ateşle</b> vur', 3800); }
  }
  for (const o of objects) {
    if (o.kind === 'shrine' && o.active && Math.hypot(hero.x - o.x, hero.y - o.y) < 1.3) {
      o.active = false;
      hero.hp = hero.maxHp; hero.mana = hero.maxMana;
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
function drawWing(s, spread, flap, lo) {
  const rootX = s * 5, rootY = -25 + lo;
  const wristX = s * (6 + 15 * spread), wristY = -37 - 5 * spread + flap + lo;
  const tipX = s * (8 + 24 * spread), tipY = -27 + flap * 1.6 + lo;
  const N = 16, list = [];
  for (let k = N - 1; k >= 0; k--) {
    const f = k / (N - 1);
    let ax, ay;
    if (f < 0.5) { const q = f / 0.5; ax = lerp(rootX, wristX, q); ay = lerp(rootY, wristY, q); }
    else { const q = (f - 0.5) / 0.5; ax = lerp(wristX, tipX, q); ay = lerp(wristY, tipY, q); }
    const len = (7 + f * 24) * (0.35 + 0.65 * spread);
    list.push([ax, ay, ax + s * (1 + f * 7) * spread, ay + len]);
  }
  for (const L of list) feather(L[0], L[1], L[2], L[3], 0);
  for (const L of list) feather(L[0], L[1], L[2], L[3], 1);
  // örtü tüyleri
  for (let k = 0; k < 6; k++) {
    const f = k / 5;
    const ax = lerp(rootX, wristX, f), ay = lerp(rootY, wristY, f);
    P(Math.round(ax) - 2, Math.round(ay) - 1, 5, 5, HC.O);
    P(Math.round(ax) - 1, Math.round(ay), 3, 3, HC.wh);
    P(Math.round(ax) - 1, Math.round(ay) + 2, 3, 1, HC.whS);
  }
}
function drawHalo(y, a) {
  ctx.globalAlpha = a;
  for (let k = 0; k < 40; k++) {
    const t = k / 40 * TAU;
    P(Math.round(Math.cos(t) * 8), Math.round(y + Math.sin(t) * 2.5), 1, 1, k % 3 ? '#f6d36b' : '#fff3b0');
  }
  for (let k = 0; k < 9; k++) {
    const t = Math.PI + (k + 0.5) / 9 * Math.PI;
    const bx = Math.cos(t) * 8, by = y + Math.sin(t) * 2.5;
    for (let l = 1; l <= 3 + (k % 2); l++) P(Math.round(bx + Math.cos(t) * l * 0.6), Math.round(by + Math.sin(t) * l), 1, 1, '#f6d36b');
  }
  ctx.globalAlpha = 1;
}
function drawSword(spr, x, y, ang, px, py) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.drawImage(spr, -px, -py); ctx.restore();
}

function drawHero() {
  const h = hero;
  if (!h.visible) return;
  const sx = sX(h.x, h.y), sy = sY(h.x, h.y);
  const t = h.anim;
  const lo = Math.round(h.crouch * 7);
  const z = Math.round(Math.max(0, 5 + Math.sin(t * 2.6) * 1.5 - h.crouch * 6));
  shadow(sx, sy, 9 - Math.min(3, z / 3), 0.5);
  if (h.dead) ctx.globalAlpha = 0.5;
  if (h.invT > 0 && h.dashT <= 0 && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha = 0.55;
  FL = h.flash > 0 ? '#ffb0a0' : null;
  ctx.save();
  ctx.translate(sx, sy - z);
  if (h.haloA > 0) drawHalo(-42 + lo, h.haloA);
  const flap = Math.sin(t * (h.dashT > 0 ? 22 : 3.6)) * (h.dashT > 0 ? 3 : 1.3);
  drawWing(-1, h.wingSpread, flap, lo);
  drawWing(1, h.wingSpread, flap, lo);
  ctx.scale(h.face, 1);
  const O = HC.O;
  // pelerin
  P(-7, -23 + lo, 14, 22 - lo, O); P(-6, -22 + lo, 12, 20 - lo, HC.whS); P(-6, -22 + lo, 4, 20 - lo, HC.wh);
  for (let k = 0; k < 6; k++) P(-6 + k * 2, -2 + ((k + Math.floor(t * 4)) % 2), 1, 1, HC.ruD);
  // bacaklar
  const legH = 12 - lo;
  P(-5, -legH, 4, legH, O); P(-4, -legH, 2, legH - 1, HC.y); P(-4, -legH, 1, legH - 1, HC.Y);
  P(1, -legH, 4, legH, O); P(2, -legH, 2, legH - 1, HC.y); P(3, -legH, 1, legH - 1, HC.o);
  if (legH > 6) { P(-4, -legH + 3, 2, 2, HC.ru); P(2, -legH + 3, 2, 2, HC.ru); }
  P(-5, -2, 4, 2, HC.o); P(1, -2, 4, 2, HC.o);
  const u = lo; // üst gövde kaydırma
  // tabard
  P(-2, -17 + u, 4, 11, O); P(-1, -17 + u, 2, 10, HC.ru); P(-1, -9 + u, 2, 2, HC.ruD);
  // tasset
  P(-7, -18 + u, 5, 6, O); P(-6, -17 + u, 3, 4, HC.y); P(-6, -17 + u, 3, 1, HC.Y);
  P(2, -18 + u, 5, 6, O); P(3, -17 + u, 3, 4, HC.y); P(3, -17 + u, 3, 1, HC.Y);
  // kemer
  P(-6, -19 + u, 12, 2, HC.d); P(-1, -19 + u, 2, 2, HC.ruL);
  // gövde
  P(-6, -27 + u, 12, 9, O); P(-5, -26 + u, 10, 7, HC.y); P(-4, -26 + u, 3, 6, HC.Y); P(2, -25 + u, 3, 6, HC.o);
  P(-1, -24 + u, 2, 3, HC.ru); P(-1, -24 + u, 1, 1, HC.ruL);
  P(-4, -26 + u, 3, 1, HC.wh); P(1, -26 + u, 3, 1, HC.wh);
  // kollar
  P(-10, -21 + u, 4, 9, O); P(-9, -21 + u, 2, 7, HC.y); P(-10, -14 + u, 4, 3, HC.o);
  P(6, -21 + u, 4, 9, O); P(7, -21 + u, 2, 7, HC.y); P(6, -14 + u, 4, 3, HC.o);
  // omuzluklar
  P(-12, -29 + u, 7, 8, O); P(-11, -28 + u, 5, 6, HC.Y); P(-11, -28 + u, 5, 1, HC.HL); P(-11, -23 + u, 5, 1, HC.o); P(-9, -26 + u, 2, 2, HC.ru);
  P(5, -29 + u, 7, 8, O); P(6, -28 + u, 5, 6, HC.y); P(6, -28 + u, 5, 1, HC.Y); P(6, -23 + u, 5, 1, HC.o); P(8, -26 + u, 2, 2, HC.ru);
  // boyun & baş
  P(-1, -29 + u, 2, 2, HC.skS);
  P(-4, -36 + u, 8, 8, O); P(-3, -35 + u, 6, 6, HC.sk); P(-3, -30 + u, 6, 1, HC.skS);
  P(-2, -33 + u, 1, 1, '#3a2a20'); P(1, -33 + u, 1, 1, '#3a2a20');
  P(2, -35 + u, 1, 5, HC.skS);
  // saç
  const wv = Math.round(Math.sin(t * 3) * 1);
  P(-5, -38 + u, 10, 3, O); P(-4, -38 + u, 8, 3, HC.ha); P(-3, -38 + u, 4, 1, '#fff0b0');
  P(-6, -36 + u, 3, 9, O); P(-5, -36 + u, 2, 8, HC.ha); P(-5, -31 + u, 2, 3, HC.haS);
  P(3, -36 + u, 3, 9, O); P(4, -36 + u, 1, 8, HC.ha); P(4, -31 + u, 2, 3, HC.haS);
  P(-8 + wv, -33 + u, 2, 6, HC.haS); P(6 - wv, -33 + u, 2, 6, HC.haD);
  ctx.restore();

  // kılıç
  const hand = { x: sx + h.face * 8, y: sy - z - 13 + lo };
  let ang;
  if (h.atkT > 0) {
    const p = easeOut(1 - h.atkT / h.atkDur);
    ang = lerp(h.swingA0, h.swingA1, p);
    hand.x = sx + Math.cos(ang) * 5; hand.y = sy - z - 16 + Math.sin(ang) * 3;
    // kılıç izi
    const r = 24, cx = sx, cy = sy - z - 16;
    const a0 = h.swingA0, a1 = ang;
    const alpha = 0.85 * (1 - p * 0.6);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 5; ctx.strokeStyle = `rgba(255,170,60,${alpha * 0.55})`;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,245,210,${alpha})`;
    ctx.beginPath(); ctx.arc(cx, cy, r + 1, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
    ctx.restore();
  } else {
    ang = Math.PI / 2 - h.face * (0.35 + Math.sin(t * 2.6) * 0.04);
  }
  if (!h.dead && h.crouch < 0.95) drawSword(swordSpr, Math.round(hand.x), Math.round(hand.y), ang, 5, 3);
  // büyü eli: omuzdan ateşin çıktığı noktaya uzanan zırhlı kol
  if (h.castT > 0 && !h.dead) {
    const shx = sx - h.face * 7, shy = sy - z - 22;
    const tx = sx + Math.round((h.castX - h.castY) * 16), ty = sy + Math.round((h.castX + h.castY) * 8) - Math.round(h.castZ);
    const steps = Math.max(1, Math.round(Math.hypot(tx - shx, ty - shy)));
    for (let i = 0; i <= steps; i++) { const f = i / steps; P(Math.round(lerp(shx, tx, f)) - 2, Math.round(lerp(shy, ty, f)) - 2, 4, 4, HC.O); }
    for (let i = 0; i <= steps; i++) { const f = i / steps; P(Math.round(lerp(shx, tx, f)) - 1, Math.round(lerp(shy, ty, f)) - 1, 2, 2, f > 0.75 ? HC.o : HC.y); }
    const pulse = h.castT / 0.3;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = Math.round(3 + pulse * 4);
    P(tx - gr, ty - gr, gr * 2, gr * 2, 'rgba(255,170,60,0.35)');
    P(tx - 2, ty - 2, 4, 4, '#fff3b0'); P(tx - 1, ty - 1, 2, 2, '#ffffff');
    ctx.restore();
    light(tx, ty, 40 * pulse + 10, 0.8, 'rgba(255,200,100,');
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
const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function drawNumber(str, x, y, color, a = 1) {
  ctx.globalAlpha = a;
  const w = str.length * 4 - 1;
  let px = Math.round(x - w / 2);
  for (const ch of str) {
    const g = DIG[+ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') {
      const gx = px + (i % 3), gy = Math.round(y) + ((i / 3) | 0);
      ctx.fillStyle = '#000'; ctx.fillRect(gx - 1, gy - 1, 3, 3);
    }
    px += 4;
  }
  px = Math.round(x - w / 2);
  for (const ch of str) {
    const g = DIG[+ch];
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
      P(x - 3, y - 3, 6, 6, '#ff9a30'); P(x - 2, y - 4, 4, 8, '#ffb040'); P(x - 4, y - 2, 8, 4, '#ffb040');
      P(x - 2, y - 2, 4, 4, '#fff3b0'); P(x - 1, y - 1, 2, 2, '#ffffff');
      light(x, y, 46, 0.9, 'rgba(255,190,80,');
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
  if (hero.visible) light(hs.x, hs.y - 26, 78 + Math.sin(time * 2) * 3, 0.95, 'rgba(255,210,120,');
  if (hero.visible && hero.haloA > 0) light(hs.x, hs.y - 45, 26, 0.4 * hero.haloA, 'rgba(255,230,150,');

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
function drawHUD() {
  const r = isTouch ? 12 : 17;
  const pad = 6;
  if (isTouch) {
    drawOrb(pad + r + 2, pad + r + 2, r, hero.hp / hero.maxHp, '#ff3a4a', '#6a0010', String(Math.ceil(hero.hp)));
    drawOrb(pad + r * 3 + 10, pad + r + 2, r, hero.mana / hero.maxMana, '#ffe07a', '#8a5a10', String(Math.floor(hero.mana)));
  } else {
    drawOrb(pad + r + 4, VH - pad - r - 10, r, hero.hp / hero.maxHp, '#ff3a4a', '#6a0010', String(Math.ceil(hero.hp)));
    drawOrb(VW - pad - r - 4, VH - pad - r - 10, r, hero.mana / hero.maxMana, '#ffe07a', '#8a5a10', String(Math.floor(hero.mana)));
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
function updateCamera(dt, snap = false) {
  const tx = isoX(hero.x, hero.y) - VW / 2;
  const ty = isoY(hero.x, hero.y) - VH / 2 - 18;
  if (snap) { cam.x = tx; cam.y = ty; return; }
  const k = 1 - Math.pow(0.002, dt);
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
    $('dlg-portrait').classList.toggle('hidden', kind === 'none');
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
    if (isTouch) tip('Sol taraf: <b>hareket</b> · <b>⚔</b> kılıç · <b>✹</b> kutsal ateş · <b>➶</b> kanat atılışı', 6500);
    else tip('<b>WASD</b> hareket · <b>Sol tık</b> kılıç · <b>Sağ tık</b> kutsal ateş · <b>Boşluk</b> kanat atılışı', 6500);
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
  hero.dead = false; hero.hp = hero.maxHp; hero.mana = hero.maxMana; hero.invT = 1.5;
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
  if (state === 'play') { prevState = state; state = 'paused'; $('pause').classList.add('show'); }
  else if (state === 'paused') { state = prevState; $('pause').classList.remove('show'); }
}

// ---------------------------------------------------------
// Ana döngü
// ---------------------------------------------------------
let last = performance.now();
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
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
  runIntro();
});
$('btn-skip').addEventListener('click', e => { e.stopPropagation(); skipIntro(); });
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
window.__game = { hero, enemies: () => enemies, state: () => state, skipIntro, get boss() { return boss; } };
})();
