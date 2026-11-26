(() => {
'use strict';

/* =========================================================
   Utilidades
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const store = {
  get(k, d) { try { const v = localStorage.getItem('catmine:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('catmine:' + k, JSON.stringify(v)); } catch {} }
};
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const fmtTime = s => { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const fmtNum = n => Math.round(n).toLocaleString('pt-BR');
const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/* Ícones das células (SVG em data URI) */
const PAW = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><ellipse cx='32' cy='42' rx='14' ry='12'/><ellipse cx='14' cy='27' rx='6' ry='8' transform='rotate(-20 14 27)'/><ellipse cx='25' cy='16' rx='6' ry='8.5' transform='rotate(-6 25 16)'/><ellipse cx='39' cy='16' rx='6' ry='8.5' transform='rotate(6 39 16)'/><ellipse cx='50' cy='27' rx='6' ry='8' transform='rotate(20 50 27)'/></svg>`;
const BOMB = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><radialGradient id='g' cx='.35' cy='.35' r='.7'><stop offset='0' stop-color='#6d6496'/><stop offset='.5' stop-color='#241e44'/><stop offset='1' stop-color='#0b0919'/></radialGradient></defs><path d='M40 18c4-8 10-9 14-6' fill='none' stroke='#c9a46a' stroke-width='3' stroke-linecap='round'/><rect x='34' y='15' width='10' height='9' rx='2' transform='rotate(35 39 19)' fill='#3b3460'/><circle cx='29' cy='38' r='19' fill='url(#g)'/><ellipse cx='22' cy='30' rx='5' ry='3.5' fill='#fff' opacity='.35' transform='rotate(-35 22 30)'/><path d='M22 41l4-3 4 3M34 41l4-3 4 3' fill='none' stroke='#ffc23d' stroke-width='2.4' stroke-linecap='round'/><circle cx='55' cy='11' r='4' fill='#ffdf8a'/><circle cx='55' cy='11' r='7' fill='#ffc23d' opacity='.35'/></svg>`;
const svgUrl = s => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
document.documentElement.style.setProperty('--paw', svgUrl(PAW));
document.documentElement.style.setProperty('--bomb', svgUrl(BOMB));

/* =========================================================
   Áudio sintetizado (WebAudio)
   ========================================================= */
const Sound = (() => {
  let ctx, master, sfxGain, musicGain, delay, fb, musicTimer = null;
  let sfxOn = store.get('sfx', true), musicOn = store.get('music', false);
  const PENTA = [0, 3, 5, 7, 10];
  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = .7; master.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = sfxOn ? .9 : 0; sfxGain.connect(master);
      musicGain = ctx.createGain(); musicGain.gain.value = 0;
      delay = ctx.createDelay(1); delay.delayTime.value = .38; fb = ctx.createGain(); fb.gain.value = .42;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      musicGain.connect(master); musicGain.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(master);
      if (musicOn) startMusic();
    } catch { ctx = null; }
  }
  function tone(freq, dur = .12, type = 'sine', vol = .3, when = 0, glide = 0, dest) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(30, glide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest || sfxGain); o.start(t); o.stop(t + dur + .05);
  }
  function noise(dur = .6, vol = .5, freq = 900) {
    if (!ctx) return;
    const len = ctx.sampleRate * dur, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 3, ctx.currentTime); f.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + dur);
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(sfxGain); src.start();
  }
  const note = (n, base = 440) => base * Math.pow(2, n / 12);
  function meow(when = 0, pitch = 1) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6;
    const g = ctx.createGain();
    o.frequency.setValueAtTime(520 * pitch, t); o.frequency.linearRampToValueAtTime(760 * pitch, t + .16); o.frequency.linearRampToValueAtTime(440 * pitch, t + .5);
    bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1900, t + .18); bp.frequency.linearRampToValueAtTime(800, t + .5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.28, t + .05); g.gain.linearRampToValueAtTime(.2, t + .3); g.gain.exponentialRampToValueAtTime(.001, t + .55);
    o.connect(bp); bp.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + .6);
  }
  function startMusic() {
    if (!ctx || musicTimer) return;
    musicGain.gain.setTargetAtTime(.22, ctx.currentTime, .8);
    let step = 0;
    const chords = [[-12, -5, 0], [-9, -2, 3], [-14, -7, -2], [-10, -3, 2]];
    const play = () => {
      const ch = chords[Math.floor(step / 8) % chords.length];
      if (step % 8 === 0) ch.forEach(n => tone(note(n, 220), 3.2, 'triangle', .07, 0, 0, musicGain));
      if (Math.random() < .62) { const n = PENTA[Math.floor(Math.random() * 5)] + (Math.random() < .5 ? 12 : 0); tone(note(n + ch[0] + 12, 220), .9, 'sine', .09, 0, 0, musicGain); }
      step++;
    };
    play(); musicTimer = setInterval(play, 420);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } if (ctx) musicGain.gain.setTargetAtTime(0, ctx.currentTime, .3); }
  return {
    init,
    get sfx() { return sfxOn; }, get music() { return musicOn; },
    toggleSfx() { sfxOn = !sfxOn; store.set('sfx', sfxOn); init(); if (sfxGain) sfxGain.gain.value = sfxOn ? .9 : 0; return sfxOn; },
    toggleMusic() { musicOn = !musicOn; store.set('music', musicOn); init(); musicOn ? startMusic() : stopMusic(); return musicOn; },
    click() { tone(1200, .04, 'square', .05); },
    hover() { tone(2400, .03, 'sine', .025); },
    reveal(n) {
      if (n <= 1) { tone(rand(620, 700), .09, 'triangle', .22, 0, 900); return; }
      const k = Math.min(9, 2 + Math.floor(n / 6));
      for (let i = 0; i < k; i++) tone(note(PENTA[i % 5] + 12 * Math.floor(i / 5), 523), .22, 'triangle', .14, i * .045);
    },
    flag() { tone(880, .07, 'triangle', .22, 0, 1320); tone(1760, .06, 'sine', .08, .04); },
    unflag() { tone(990, .08, 'triangle', .18, 0, 520); },
    chordFail() { tone(220, .1, 'square', .07); },
    hint() { [0, 4, 7, 12].forEach((n, i) => tone(note(n, 660), .3, 'sine', .14, i * .06)); },
    tick() { tone(1500, .03, 'square', .06); },
    lifeLost() { noise(.5, .55, 700); tone(300, .45, 'sawtooth', .16, 0, 80); meow(.25, .85); },
    boom() { noise(1.3, .9, 1100); tone(110, .9, 'sine', .55, 0, 30); tone(70, 1.2, 'triangle', .4, .05, 25); },
    small() { noise(.35, .25, 900); },
    win() { [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(note(n, 523), .5, 'triangle', .16, i * .08)); meow(.65, 1.15); },
    meow
  };
})();

/* =========================================================
   Céu: estrelas, cidade, nuvens, parallax
   ========================================================= */
const starsC = $('#stars'), farC = $('#city-far'), nearC = $('#city-near'), moonEl = $('#moon');
let stars = [], shooting = [], W = innerWidth, H = innerHeight, DPR = Math.min(2, devicePixelRatio || 1);
let nearWindows = [];
function sizeCanvas(c) { const r = c.getBoundingClientRect(); c.width = Math.max(1, r.width * DPR); c.height = Math.max(1, r.height * DPR); const x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); return [x, r.width, r.height]; }
function buildStars() {
  const [, w, h] = sizeCanvas(starsC);
  const n = Math.round(w * h / 5200);
  stars = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h * .8, r: Math.random() < .08 ? rand(1.2, 2) : rand(.3, 1.1), p: rand(0, 6.28), s: rand(.6, 2.2), c: Math.random() < .15 ? '255,223,170' : Math.random() < .3 ? '190,180,255' : '255,255,255' }));
}
function drawCity(c, o) {
  const [x, w, h] = sizeCanvas(c);
  const rng = mulberry32(o.seed);
  x.clearRect(0, 0, w, h);
  const wins = [];
  let px = 0;
  while (px < w) {
    const bw = (o.minW + rng() * (o.maxW - o.minW));
    const bh = h * (o.minH + rng() * (o.maxH - o.minH));
    const top = h - bh;
    x.fillStyle = o.color;
    x.fillRect(px, top, bw, bh);
    const r = rng();
    if (r < .18) { x.beginPath(); x.moveTo(px - 2, top); x.lineTo(px + bw / 2, top - bw * .35); x.lineTo(px + bw + 2, top); x.fill(); }
    else if (r < .32) { x.fillRect(px + bw * .3, top - 14, 2, 14); x.fillRect(px + bw * .3 - 4, top - 10, 10, 1.5); }
    else if (r < .42) { const tw = bw * .35, tx = px + bw * .5; x.fillRect(tx, top - tw * .9, tw, tw * .7); x.fillRect(tx + 2, top - tw * .2, 1.5, tw * .2); x.fillRect(tx + tw - 3.5, top - tw * .2, 1.5, tw * .2); x.beginPath(); x.moveTo(tx - 2, top - tw * .9); x.lineTo(tx + tw / 2, top - tw * 1.2); x.lineTo(tx + tw + 2, top - tw * .9); x.fill(); }
    else if (r < .5) { x.fillRect(px + bw * .15, top - 6, bw * .7, 6); }
    if (o.windows) {
      const ws = o.ws, gap = o.wg;
      for (let wy = top + 10; wy < h - 6; wy += ws + gap) for (let wx = px + 6; wx < px + bw - ws - 4; wx += ws + gap) {
        if (rng() < o.lit) { const win = { x: wx, y: wy, s: ws, on: true, warm: rng() < .8 }; wins.push(win); paintWin(x, win, o); }
      }
    }
    px += bw + rng() * o.gap;
  }
  return { ctx: x, wins, o };
}
function paintWin(x, win, o) {
  x.fillStyle = o.color; x.fillRect(win.x - 1, win.y - 1, win.s + 2, win.s * 1.4 + 2);
  if (win.on) { x.fillStyle = win.warm ? `rgba(255, 196, 92, ${o.wa})` : `rgba(160, 200, 255, ${o.wa * .8})`; x.fillRect(win.x, win.y, win.s, win.s * 1.4); }
}
let nearCity;
function buildCity() {
  drawCity(farC, { seed: 7, color: '#1d1946', minW: 40, maxW: 110, minH: .25, maxH: .75, gap: 4, windows: true, ws: 2, wg: 6, lit: .1, wa: .35 });
  nearCity = drawCity(nearC, { seed: 23, color: '#0b0a1c', minW: 50, maxW: 140, minH: .2, maxH: .85, gap: 10, windows: true, ws: 3, wg: 7, lit: .14, wa: .8 });
}
function buildClouds() {
  const host = $('#clouds'); host.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const d = document.createElement('div'); d.className = 'cloud';
    const w = rand(260, 520);
    d.style.cssText = `width:${w}px;height:${w * .32}px;top:${rand(5, 55)}%;animation-duration:${rand(90, 170)}s;animation-delay:${-rand(0, 170)}s;opacity:${rand(.25, .6)}`;
    host.appendChild(d);
  }
}
setInterval(() => { // janelas piscando
  if (!nearCity || !nearCity.wins.length) return;
  for (let k = 0; k < 3; k++) { const w = nearCity.wins[Math.floor(Math.random() * nearCity.wins.length)]; w.on = !w.on; paintWin(nearCity.ctx, w, nearCity.o); }
}, 900);

function positionMoon() {
  const cat = $('#heroCat'); if (!cat) return;
  const r = cat.getBoundingClientRect();
  const size = moonEl.offsetWidth;
  const top = r.top + scrollY;
  moonEl.style.left = (r.left + r.width / 2 - size / 2) + 'px';
  moonEl.style.top = (top + r.height * .5 - size / 2) + 'px';
}

let mx = 0, my = 0, tmx = 0, tmy = 0, sy = 0, mox = 0, moy = 0;
addEventListener('pointermove', e => { tmx = e.clientX / W * 2 - 1; tmy = e.clientY / H * 2 - 1; }, { passive: true });
const layers = [
  [starsC, 8, .04], [$('#clouds'), 30, .12], [farC, 26, -.08], [nearC, 46, -.16]
];
const heroCat = $('#heroCat'), floatTiles = $$('.float-tile');

let t0 = performance.now();
function skyLoop(now) {
  const t = (now - t0) / 1000;
  mx = lerp(mx, tmx, .06); my = lerp(my, tmy, .06);
  sy = gameOpen ? sy : scrollY;
  if (!reduced) {
    let tx = -mx * 18, ty = -my * 9 - sy * .32;
    if (gameOpen) { const sz = moonEl.offsetWidth; tx = W * (W > 900 ? .8 : .5) - (moonEl.offsetLeft + sz / 2) - mx * 18; ty = H * (W > 900 ? .34 : .2) - (moonEl.offsetTop + sz / 2) - my * 9; }
    mox = lerp(mox, tx, .07); moy = lerp(moy, ty, .07);
    moonEl.style.transform = `translate3d(${mox}px, ${moy}px, 0)`;
    for (const [el, amp, sc] of layers) el.style.transform = `translate3d(${-mx * amp}px, ${-my * amp * .5 - sy * sc}px, 0)`;
    if (!gameOpen) {
      heroCat.style.transform = `translate3d(${mx * 14}px, ${my * 10}px, 0) rotateY(${mx * 8}deg) rotateX(${-my * 6}deg)`;
      floatTiles.forEach(el => { const d = +el.dataset.depth; el.style.translate = `${mx * 18 * d}px ${my * 14 * d}px`; });
    }
  }
  // estrelas
  const x = starsC.getContext('2d'), w = starsC.width / DPR, h = starsC.height / DPR;
  x.clearRect(0, 0, w, h);
  for (const s of stars) {
    const a = .35 + .65 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
    x.fillStyle = `rgba(${s.c},${a})`;
    x.beginPath(); x.arc(s.x, s.y, s.r, 0, 6.283); x.fill();
    if (s.r > 1.3) { x.fillStyle = `rgba(${s.c},${a * .15})`; x.beginPath(); x.arc(s.x, s.y, s.r * 4, 0, 6.283); x.fill(); }
  }
  if (!reduced && Math.random() < .004) shooting.push({ x: rand(w * .1, w), y: rand(0, h * .4), vx: -rand(7, 12), vy: rand(2, 4), life: 1 });
  shooting = shooting.filter(s => s.life > 0);
  for (const s of shooting) {
    s.x += s.vx; s.y += s.vy; s.life -= .018;
    const g = x.createLinearGradient(s.x, s.y, s.x - s.vx * 10, s.y - s.vy * 10);
    g.addColorStop(0, `rgba(255,240,210,${s.life})`); g.addColorStop(1, 'rgba(255,240,210,0)');
    x.strokeStyle = g; x.lineWidth = 2; x.beginPath(); x.moveTo(s.x, s.y); x.lineTo(s.x - s.vx * 10, s.y - s.vy * 10); x.stroke();
  }
  requestAnimationFrame(skyLoop);
}

/* =========================================================
   Partículas (canvas FX)
   ========================================================= */
const fxC = $('#fx'); let fx = fxC.getContext('2d'); let parts = [];
function sizeFx() { fxC.width = W * DPR; fxC.height = H * DPR; fx.setTransform(DPR, 0, 0, DPR, 0, 0); }
function emit(p) { if (reduced && p.kind !== 'ring') return; parts.push(Object.assign({ life: 1, decay: .02, vx: 0, vy: 0, g: 0, drag: .98, size: 3, rot: 0, vr: 0, delay: 0, color: '255,223,138' }, p)); }
function burstDust(x, y, color = '196,186,255', n = 6, delay = 0) {
  for (let i = 0; i < n; i++) { const a = rand(0, 6.28), sp = rand(.6, 2.6); emit({ kind: 'dot', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - .6, size: rand(1, 2.6), decay: rand(.02, .04), color, delay }); }
}
function explode(x, y, big = true) {
  emit({ kind: 'ring', x, y, size: 6, grow: big ? 9 : 5, decay: .03, color: '255,120,90' });
  emit({ kind: 'ring', x, y, size: 2, grow: big ? 5 : 3, decay: .022, color: '255,223,138' });
  for (let i = 0; i < (big ? 46 : 20); i++) { const a = rand(0, 6.28), sp = rand(2, big ? 11 : 6); emit({ kind: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: .18, size: rand(3, 8), rot: rand(0, 6), vr: rand(-.3, .3), decay: rand(.012, .025), color: Math.random() < .5 ? '255,90,110' : Math.random() < .5 ? '255,170,60' : '60,50,100' }); }
  for (let i = 0; i < (big ? 30 : 12); i++) { const a = rand(0, 6.28), sp = rand(1, 7); emit({ kind: 'dot', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: .05, size: rand(1.5, 3.5), decay: rand(.015, .03), color: '255,223,138' }); }
  for (let i = 0; i < (big ? 10 : 4); i++) emit({ kind: 'smoke', x: x + rand(-8, 8), y: y + rand(-8, 8), vx: rand(-.6, .6), vy: rand(-1.4, -.4), size: rand(10, 22), grow: .4, decay: .012, color: '80,70,120' });
}
function confetti() {
  const cols = ['255,194,61', '255,223,138', '124,196,255', '126,224,166', '199,155,255', '255,138,138', '244,239,216'];
  for (let i = 0; i < 180; i++) emit({ kind: 'conf', x: rand(0, W), y: rand(-H * .3, -10), vx: rand(-1.5, 1.5), vy: rand(1, 4), g: .05, drag: .995, size: rand(5, 10), rot: rand(0, 6), vr: rand(-.2, .2), decay: rand(.004, .008), color: cols[i % cols.length], wob: rand(0, 6) });
}
function starBurst(x, y, n = 24) {
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.283, sp = rand(3, 9); emit({ kind: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: .94, size: rand(5, 11), rot: rand(0, 6), vr: rand(-.15, .15), decay: rand(.012, .02), color: Math.random() < .6 ? '255,223,138' : '244,239,216' }); }
}
function drawStar(c, r) { c.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * .35 : r, a = i * Math.PI / 4; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); }
function fxLoop() {
  fx.clearRect(0, 0, W, H);
  const next = [];
  for (const p of parts) {
    if (p.delay > 0) { p.delay -= 16; next.push(p); continue; }
    p.vx *= p.drag; p.vy *= p.drag; p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= p.decay;
    if (p.grow) p.size += p.grow;
    if (p.life <= 0) continue;
    next.push(p);
    const a = Math.max(0, p.life);
    fx.save(); fx.translate(p.x, p.y); fx.rotate(p.rot);
    switch (p.kind) {
      case 'dot': fx.fillStyle = `rgba(${p.color},${a})`; fx.shadowColor = `rgba(${p.color},${a})`; fx.shadowBlur = 8; fx.beginPath(); fx.arc(0, 0, p.size, 0, 6.283); fx.fill(); break;
      case 'ring': fx.strokeStyle = `rgba(${p.color},${a})`; fx.lineWidth = 3 * a; fx.beginPath(); fx.arc(0, 0, p.size, 0, 6.283); fx.stroke(); break;
      case 'shard': fx.fillStyle = `rgba(${p.color},${a})`; fx.beginPath(); fx.moveTo(0, -p.size); fx.lineTo(p.size * .6, p.size * .5); fx.lineTo(-p.size * .6, p.size * .5); fx.fill(); break;
      case 'smoke': fx.fillStyle = `rgba(${p.color},${a * .35})`; fx.beginPath(); fx.arc(0, 0, p.size, 0, 6.283); fx.fill(); break;
      case 'conf': p.wob += .1; fx.scale(1, Math.sin(p.wob)); fx.fillStyle = `rgba(${p.color},${Math.min(1, a * 2)})`; fx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); break;
      case 'star': fx.fillStyle = `rgba(${p.color},${a})`; fx.shadowColor = `rgba(${p.color},1)`; fx.shadowBlur = 12; drawStar(fx, p.size); break;
    }
    fx.restore();
  }
  parts = next;
  requestAnimationFrame(fxLoop);
}
function flash(x, y, gold = false) {
  const f = $('#flash'); f.classList.remove('go', 'gold'); void f.offsetWidth;
  f.style.setProperty('--fx', x + 'px'); f.style.setProperty('--fy', y + 'px');
  if (gold) f.classList.add('gold'); f.classList.add('go');
}
function floater(x, y, text, cls = '') {
  const d = document.createElement('div'); d.className = 'floater ' + cls; d.textContent = text;
  d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d);
  d.addEventListener('animationend', () => d.remove());
}

/* =========================================================
   Cursor personalizado
   ========================================================= */
const curDot = $('#cur-dot'), curRing = $('#cur-ring');
let cx = W / 2, cy = H / 2, rx = cx, ry = cy, lastTrail = 0;
if (finePointer) {
  document.body.classList.add('custom-cursor');
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    cx = e.clientX; cy = e.clientY;
    document.body.classList.remove('cur-hidden');
    const now = performance.now();
    if (now - lastTrail > 40 && !reduced) { lastTrail = now; emit({ kind: 'dot', x: cx + rand(-3, 3), y: cy + rand(-3, 3), vy: rand(-.3, .3), vx: rand(-.3, .3), size: rand(.8, 1.8), decay: .035, color: '255,223,138' }); }
  }, { passive: true });
  document.addEventListener('pointerleave', () => document.body.classList.add('cur-hidden'));
  addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') { document.body.classList.add('cur-down'); emit({ kind: 'ring', x: e.clientX, y: e.clientY, size: 4, grow: 2.2, decay: .05, color: '255,223,138' }); } });
  addEventListener('pointerup', () => document.body.classList.remove('cur-down'));
  document.addEventListener('pointerover', e => {
    const t = e.target;
    const hov = t.closest && t.closest('[data-hover], button, a, input, .mode, .diff');
    const cell = t.closest && t.closest('.board .cell');
    document.body.classList.toggle('cur-cell', !!cell);
    document.body.classList.toggle('cur-hover', !!hov && !cell);
  });
  (function curLoop() {
    rx = lerp(rx, cx, .2); ry = lerp(ry, cy, .2);
    curDot.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    curRing.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    requestAnimationFrame(curLoop);
  })();
} else { curDot.remove(); curRing.remove(); }

/* =========================================================
   Configuração de modos e dificuldades
   ========================================================= */
const MODES = [
  { id: 'classic', name: 'Clássico', icon: 'i-grid', desc: 'O campo minado de sempre. Abra todas as telhas seguras o mais rápido possível.', tag: 'Pontos x1' },
  { id: 'lives', name: 'Nove Vidas', icon: 'i-heart', desc: 'Todo gato tem nove vidas. Cada mina custa uma, mas a ronda continua.', tag: 'Ideal para aprender' },
  { id: 'time', name: 'Contra o Relógio', icon: 'i-bolt', desc: 'O tempo corre para trás. Cada telha aberta devolve alguns décimos.', tag: 'Pontos x1,5' },
  { id: 'dark', name: 'Noite Escura', icon: 'i-moon', desc: 'Só os olhos do gato iluminam. Você enxerga apenas em volta do cursor.', tag: 'Pontos x2' },
  { id: 'daily', name: 'Desafio Diário', icon: 'i-cal', desc: 'Um tabuleiro novo por dia, igual para todo mundo. Comece pela telha verde.', tag: 'Muda à meia-noite' }
];
const DIFFS = [
  { id: 'kitten', name: 'Filhote', cols: 9, rows: 9, mines: 10, mult: 1, time: 60, par: 60 },
  { id: 'street', name: 'Gato de Rua', cols: 16, rows: 16, mines: 40, mult: 2, time: 180, par: 180 },
  { id: 'panther', name: 'Pantera', cols: 30, rows: 16, mines: 99, mult: 4, time: 420, par: 420 },
  { id: 'custom', name: 'Personalizado', cols: 20, rows: 14, mines: 45, mult: 0, time: 0, par: 0 }
];
const MODE_MULT = { classic: 1, lives: .8, time: 1.5, dark: 2, daily: 1.5 };

let sel = store.get('sel', { mode: 'classic', diff: 'street' });
if (!MODES.find(m => m.id === sel.mode)) sel.mode = 'classic';
if (!DIFFS.find(d => d.id === sel.diff)) sel.diff = 'street';
let custom = store.get('custom', { cols: 20, rows: 14, mines: 45 });

const ICO = id => `<svg><use href="#${id}"/></svg>`;
function renderModes() {
  const host = $('#modes'); host.innerHTML = '';
  const dailyDone = store.get('daily:' + todayKey(), null);
  MODES.forEach(m => {
    const b = document.createElement('button'); b.className = 'mode'; b.type = 'button'; b.dataset.mode = m.id;
    b.setAttribute('aria-pressed', sel.mode === m.id);
    b.innerHTML = `<span class="mode-ico">${ICO(m.icon)}</span><h3>${m.name}</h3><p>${m.desc}</p><span class="tag">${m.tag}</span>${m.id === 'daily' && dailyDone ? `<span class="done">✓ ${fmtTime(dailyDone.time)}</span>` : ''}`;
    b.addEventListener('click', () => { sel.mode = m.id; store.set('sel', sel); Sound.init(); Sound.click(); renderModes(); renderDiffs(); updateBest(); });
    b.addEventListener('pointermove', e => {
      if (reduced || e.pointerType !== 'mouse') return;
      const r = b.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      b.style.transform = `rotateY(${(px - .5) * 14}deg) rotateX(${(.5 - py) * 12}deg) translateZ(6px)`;
      b.style.setProperty('--gx', px * 100 + '%'); b.style.setProperty('--gy', py * 100 + '%');
    });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    b.addEventListener('mouseenter', () => Sound.hover());
    host.appendChild(b);
  });
}
function miniGrid(d) {
  const n = 5, cells = [];
  const r = mulberry32(hashStr(d.id));
  const dens = d.id === 'custom' ? .2 : d.mines / (d.cols * d.rows);
  for (let i = 0; i < n * n; i++) cells.push(`<i class="${r() < dens * 1.3 ? 'm' : ''}"></i>`);
  return `<span class="mini-grid" style="grid-template-columns:repeat(${n},1fr)">${cells.join('')}</span>`;
}
function renderDiffs() {
  const host = $('#diffs'); host.innerHTML = '';
  const isDaily = sel.mode === 'daily';
  DIFFS.forEach(d => {
    const b = document.createElement('button'); b.className = 'diff'; b.type = 'button';
    const active = isDaily ? d.id === 'street' : sel.diff === d.id;
    b.setAttribute('aria-pressed', active);
    if (isDaily && d.id !== 'street') b.disabled = true;
    const sub = d.id === 'custom' ? 'você escolhe' : `${d.cols}×${d.rows} · ${d.mines} minas`;
    b.innerHTML = `${miniGrid(d)}<span><b>${d.name}</b><small>${sub}</small></span>`;
    b.addEventListener('click', () => { sel.diff = d.id; store.set('sel', sel); Sound.init(); Sound.click(); renderDiffs(); updateBest(); });
    b.addEventListener('mouseenter', () => Sound.hover());
    host.appendChild(b);
  });
  $('#custom').classList.toggle('show', sel.diff === 'custom' && !isDaily);
}
function setupCustom() {
  const cw = $('#cw'), ch = $('#ch'), cm = $('#cm');
  cw.value = custom.cols; ch.value = custom.rows; cm.value = custom.mines;
  const sync = () => {
    custom.cols = +cw.value; custom.rows = +ch.value;
    const maxM = Math.max(4, custom.cols * custom.rows - 10);
    cm.max = Math.min(300, maxM);
    custom.mines = Math.min(+cm.value, +cm.max);
    cm.value = custom.mines;
    $('#cwo').textContent = custom.cols; $('#cho').textContent = custom.rows; $('#cmo').textContent = custom.mines;
    store.set('custom', custom);
  };
  [cw, ch, cm].forEach(i => i.addEventListener('input', sync)); sync();
}
function bestKey(mode, diff) { return `best:${mode}:${diff}`; }
function updateBest() {
  const diff = sel.mode === 'daily' ? 'street' : sel.diff;
  const el = $('#bestLine');
  if (sel.mode === 'daily') {
    const d = store.get('daily:' + todayKey(), null);
    el.innerHTML = d ? `Hoje: <b>${fmtTime(d.time)}</b> · <b>${fmtNum(d.score)}</b> pts` : `Desafio de <b>${new Date().toLocaleDateString('pt-BR')}</b>`;
    return;
  }
  if (diff === 'custom') { el.textContent = 'Partidas personalizadas não entram no ranking'; return; }
  const b = store.get(bestKey(sel.mode, diff), null);
  el.innerHTML = b ? `Recorde: <b>${fmtTime(b.time)}</b> · <b>${fmtNum(b.score)}</b> pts` : 'Sem recorde ainda nesta combinação';
}

/* =========================================================
   Conquistas e estatísticas
   ========================================================= */
const ACHS = [
  { id: 'first', name: 'Primeiras Patas', desc: 'Vença sua primeira ronda' },
  { id: 'fast', name: 'Relâmpago', desc: 'Vença no Filhote em menos de 20s' },
  { id: 'street', name: 'Malandro', desc: 'Vença no Gato de Rua' },
  { id: 'panther', name: 'Pantera Negra', desc: 'Vença na dificuldade Pantera' },
  { id: 'lives', name: 'Sete Vidas', desc: 'Vença Nove Vidas com 7 ou mais vidas' },
  { id: 'clock', name: 'Contra o Tempo', desc: 'Vença Contra o Relógio' },
  { id: 'dark', name: 'Olhos de Gato', desc: 'Vença na Noite Escura' },
  { id: 'daily', name: 'Ronda Noturna', desc: 'Complete um desafio diário' },
  { id: 'pure', name: 'Instinto Puro', desc: 'Vença Gato de Rua ou acima sem Visão Felina' },
  { id: 'combo', name: 'Frenesi', desc: 'Chegue a um combo x8' }
];
let unlocked = store.get('achs', {});
let stats = store.get('stats', { played: 0, wins: 0, streak: 0, bestStreak: 0, cells: 0, flags: 0 });
function renderAchs() {
  const host = $('#achs'); host.innerHTML = '';
  ACHS.forEach(a => {
    const got = !!unlocked[a.id];
    const d = document.createElement('div'); d.className = 'ach' + (got ? ' got' : '');
    d.innerHTML = `<span class="medal">${ICO(got ? 'i-medal' : 'i-lock')}</span><span><b>${a.name}</b><small>${a.desc}</small></span>`;
    host.appendChild(d);
  });
  $('#factAch').textContent = `${Object.keys(unlocked).length}/${ACHS.length}`;
  const rate = stats.played ? Math.round(stats.wins / stats.played * 100) : 0;
  const rows = DIFFS.filter(d => d.id !== 'custom').map(d => {
    const b = store.get(bestKey('classic', d.id), null);
    return `<div><span>Clássico · ${d.name}</span><b>${b ? fmtTime(b.time) : '—'}</b></div>`;
  }).join('');
  $('#stats').innerHTML = `<h3>Seu histórico</h3>
    <div class="stat"><b>${stats.played}</b><span>rondas</span></div>
    <div class="stat"><b>${rate}%</b><span>vitórias</span></div>
    <div class="stat"><b>${stats.bestStreak}</b><span>melhor sequência</span></div>
    <div class="stat"><b>${fmtNum(stats.cells)}</b><span>telhas abertas</span></div>
    <div class="besttable">${rows}</div>`;
}
function unlock(id) {
  if (unlocked[id]) return;
  unlocked[id] = Date.now(); store.set('achs', unlocked);
  const a = ACHS.find(x => x.id === id);
  const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `<span class="medal">${ICO('i-medal')}</span><span><small>Conquista desbloqueada</small><b>${a.name}</b></span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); t.addEventListener('animationend', () => t.remove()); }, 3800);
  renderAchs();
}

/* =========================================================
   Motor do campo minado
   ========================================================= */
const boardEl = $('#board'), wrapEl = $('#boardWrap'), gameEl = $('#game');
const darkMask = $('#darkMask');
let G = null, els = [], gameOpen = false, flagMode = false, timerRAF = 0, focusIdx = 0;

function neighbors(i, cols, rows) {
  const x = i % cols, y = (i / cols) | 0, out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.push(ny * cols + nx);
  }
  return out;
}

function newGame() {
  const mode = sel.mode;
  let d = DIFFS.find(x => x.id === (mode === 'daily' ? 'street' : sel.diff));
  let cols = d.cols, rows = d.rows, mines = d.mines, mult = d.mult, par = d.par, tlimit = d.time;
  if (d.id === 'custom') {
    cols = custom.cols; rows = custom.rows; mines = custom.mines;
    const dens = mines / (cols * rows);
    mult = Math.max(.5, +(dens * 12 * Math.sqrt(cols * rows / 81)).toFixed(1));
    par = Math.round(cols * rows * .9); tlimit = Math.round(cols * rows * .8);
  }
  const portrait = innerWidth < innerHeight && innerWidth < 760;
  if (portrait && cols > rows) [cols, rows] = [rows, cols];
  const N = cols * rows;
  G = {
    mode, diff: d.id, diffName: d.name, cols, rows, N, mines, mult, par,
    mine: new Uint8Array(N), adj: new Uint8Array(N), open: new Uint8Array(N), flag: new Uint8Array(N),
    started: false, over: false, won: false, t0: 0, elapsed: 0, timeLeft: tlimit, tlimit,
    lives: mode === 'lives' ? 9 : 1, hints: 3, usedHint: false, score: 0, combo: 1, maxCombo: 1, lastAct: 0,
    opened: 0, flags: 0, hits: 0, startCell: -1, lastTick: -1, bonusTime: 0
  };
  gameEl.classList.remove('st-lose', 'st-win', 'over', 'pressing');
  buildBoard();
  if (mode === 'daily') {
    const rng = mulberry32(hashStr('catmine-' + todayKey()));
    placeMines(-1, rng);
    // telha inicial: o zero mais próximo do centro
    let best = -1, bd = 1e9; const cx0 = (cols - 1) / 2, cy0 = (rows - 1) / 2;
    for (let i = 0; i < N; i++) if (!G.mine[i] && G.adj[i] === 0) { const dd = Math.hypot(i % cols - cx0, ((i / cols) | 0) - cy0); if (dd < bd) { bd = dd; best = i; } }
    G.startCell = best; if (best >= 0) els[best].classList.add('start');
  }
  const m = MODES.find(x => x.id === mode);
  $('#hudMode').textContent = m.name;
  $('#hudDiff').textContent = `${d.name} · ${cols}×${rows} · ${mines} minas`;
  $('#lives').hidden = mode !== 'lives';
  if (mode === 'lives') {
    const src = $('.brand img').src;
    $('#lives').innerHTML = Array.from({ length: 9 }, () => `<img src="${src}" alt="">`).join('');
    $('#lives').setAttribute('aria-label', '9 vidas');
  }
  darkMask.hidden = mode !== 'dark';
  darkMask.style.removeProperty('--mx'); darkMask.style.removeProperty('--my');
  $('#timeLab').textContent = mode === 'time' ? 'Restam' : 'Tempo';
  $('#timeGauge').classList.remove('warn');
  updateHUD(); updateTimer();
  setFlagMode(false);
  cancelAnimationFrame(timerRAF);
  requestAnimationFrame(fitBoard);
}

function buildBoard() {
  boardEl.innerHTML = ''; els = [];
  boardEl.style.setProperty('--cols', G.cols);
  boardEl.classList.remove('shake');
  boardEl.style.animation = 'none'; void boardEl.offsetWidth; boardEl.style.animation = '';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < G.N; i++) {
    const b = document.createElement('button');
    b.className = 'cell'; b.type = 'button'; b.dataset.i = i; b.tabIndex = i === 0 ? 0 : -1;
    b.setAttribute('aria-label', `Telha ${i % G.cols + 1}, ${((i / G.cols) | 0) + 1}, fechada`);
    frag.appendChild(b); els.push(b);
  }
  boardEl.appendChild(frag); focusIdx = 0;
  boardEl.appendChild(darkMask);
}

function fitBoard() {
  if (!G) return;
  const gap = G.cols > 20 || G.rows > 20 ? 2 : 3;
  const pad = gap * 4 + 6;
  const wp = innerWidth <= 640 ? 12 : 28;
  const aw = wrapEl.clientWidth - wp - pad * 2, ah = wrapEl.clientHeight - wp - pad * 2;
  let cs = Math.floor(Math.min((aw - gap * (G.cols - 1)) / G.cols, (ah - gap * (G.rows - 1)) / G.rows));
  cs = clamp(cs, finePointer ? 22 : 20, 54);
  boardEl.style.setProperty('--gap', gap + 'px');
  boardEl.style.setProperty('--cs', cs + 'px');
  els.forEach(e => e.style.setProperty('--cs', cs + 'px'));
  $('#darkMask').style.setProperty('--r', Math.max(90, cs * 3.4) + 'px');
}

function placeMines(safe, rng = Math.random) {
  const { N, cols, rows } = G;
  const banned = new Set();
  if (safe >= 0) { banned.add(safe); if (N - G.mines >= 9) neighbors(safe, cols, rows).forEach(n => banned.add(n)); }
  const pool = []; for (let i = 0; i < N; i++) if (!banned.has(i)) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  for (let k = 0; k < G.mines && k < pool.length; k++) G.mine[pool[k]] = 1;
  for (let i = 0; i < N; i++) { let c = 0; for (const n of neighbors(i, cols, rows)) c += G.mine[n]; G.adj[i] = c; }
}

function startClock() {
  G.started = true; G.t0 = performance.now();
  const loop = () => { if (!G || G.over) return; updateTimer(); timerRAF = requestAnimationFrame(loop); };
  timerRAF = requestAnimationFrame(loop);
}
function updateTimer() {
  if (!G) return;
  if (G.started && !G.over) G.elapsed = (performance.now() - G.t0) / 1000;
  const tv = $('#timeVal');
  if (G.mode === 'time') {
    const left = G.tlimit + G.bonusTime - G.elapsed;
    G.timeLeft = left;
    tv.textContent = fmtTime(Math.ceil(Math.max(0, left)));
    const warn = G.started && left <= 10;
    $('#timeGauge').classList.toggle('warn', warn && !G.over);
    const sec = Math.ceil(left);
    if (warn && sec !== G.lastTick && !G.over) { G.lastTick = sec; Sound.tick(); }
    if (G.started && !G.over && left <= 0) lose(-1, 'time');
  } else tv.textContent = fmtTime(G.elapsed);
}

function cellCenter(i) { const r = els[i].getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
const NUM_COL = ['196,186,255', '124,196,255', '126,224,166', '255,138,138', '199,155,255', '255,179,107', '111,240,230', '255,111,181', '240,240,240'];

function act() { // combo
  const now = performance.now();
  if (now - G.lastAct < 1800) G.combo = Math.min(8, G.combo + 1); else G.combo = 1;
  G.lastAct = now;
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  if (G.combo >= 8) unlock('combo');
  const c = $('#combo');
  c.textContent = 'COMBO x' + G.combo;
  c.classList.toggle('on', G.combo > 1);
  if (G.combo > 1) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
  clearTimeout(act.t); act.t = setTimeout(() => c.classList.remove('on'), 1800);
}
const comboMult = () => 1 + (G.combo - 1) * .25;
const scoreMult = () => G.mult * MODE_MULT[G.mode];

function reveal(i, chained = false) {
  if (!G || G.over || G.open[i] || G.flag[i]) return [];
  if (!G.started) {
    if (G.mode !== 'daily') placeMines(i);
    startClock();
    if (G.startCell >= 0) els[G.startCell].classList.remove('start');
  }
  if (G.mine[i]) { hitMine(i); return []; }
  // flood fill com distância para animação em onda
  const out = [], q = [i], dist = new Map([[i, 0]]);
  G.open[i] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h]; out.push(c);
    if (G.adj[c] === 0) for (const n of neighbors(c, G.cols, G.rows)) {
      if (!G.open[n] && !G.flag[n] && !G.mine[n]) { G.open[n] = 1; dist.set(n, dist.get(c) + 1); q.push(n); }
    }
  }
  const sample = out.length > 40 ? 40 / out.length : 1;
  for (const c of out) {
    const el = els[c], d = dist.get(c);
    el.classList.remove('start');
    el.style.setProperty('--d', Math.min(d * 26, 900) + 'ms');
    el.classList.add('open');
    if (G.adj[c]) { el.textContent = G.adj[c]; el.dataset.n = G.adj[c]; }
    el.setAttribute('aria-label', `Telha ${c % G.cols + 1}, ${((c / G.cols) | 0) + 1}, ${G.adj[c] ? G.adj[c] + ' minas vizinhas' : 'vazia'}`);
    if (Math.random() < sample) { const [x, y] = cellCenter(c); burstDust(x, y, NUM_COL[G.adj[c]], out.length > 1 ? 3 : 8, Math.min(d * 26, 900)); }
  }
  G.opened += out.length;
  stats.cells += out.length;
  if (!chained) { act(); Sound.reveal(out.length); }
  const pts = Math.round(out.length * 10 * scoreMult() * comboMult());
  G.score += pts;
  if (G.mode === 'time') { const add = out.length * .35; G.bonusTime += add; if (out.length >= 8) { const [x, y] = cellCenter(i); floater(x, y - 26, `+${add.toFixed(1)}s`); } }
  if (!chained && pts > 0) { const [x, y] = cellCenter(i); floater(x, y, '+' + fmtNum(pts), out.length > 20 ? 'big' : ''); }
  updateHUD();
  checkWin();
  return out;
}

function hitMine(i) {
  const [x, y] = cellCenter(i);
  G.hits++;
  if (G.mode === 'lives' && G.lives > 1) {
    G.lives--;
    G.flag[i] = 1; G.flags++;
    const el = els[i]; el.classList.add('flag', 'auto', 'boom');
    el.innerHTML = '<span class="ico paw"></span>';
    setTimeout(() => el.classList.remove('boom'), 700);
    explode(x, y, false); flash(x, y); shake(); Sound.lifeLost();
    G.score = Math.max(0, G.score - 300); floater(x, y, '-1 vida', 'bad big');
    G.combo = 1; $('#combo').classList.remove('on');
    const imgs = $$('#lives img'); if (imgs[G.lives]) imgs[G.lives].classList.add('lost');
    $('#lives').setAttribute('aria-label', G.lives + ' vidas');
    updateHUD(); checkWin();
    return;
  }
  if (G.mode === 'lives') { const imgs = $$('#lives img'); imgs.forEach(im => im.classList.add('lost')); G.lives = 0; }
  lose(i, 'mine');
}

function shake() { boardEl.classList.remove('shake'); void boardEl.offsetWidth; boardEl.classList.add('shake'); }

function chord(i) {
  if (!G || G.over || !G.open[i] || !G.adj[i]) return;
  const ns = neighbors(i, G.cols, G.rows);
  const f = ns.filter(n => G.flag[n]).length;
  const closed = ns.filter(n => !G.open[n] && !G.flag[n]);
  if (!closed.length) return;
  if (f !== G.adj[i]) {
    closed.forEach(n => { els[n].classList.add('peek'); setTimeout(() => els[n].classList.remove('peek'), 160); });
    Sound.chordFail(); return;
  }
  act();
  let total = 0;
  for (const n of closed) { if (G.over) break; if (G.mine[n]) { reveal(n, true); continue; } total += reveal(n, true).length; }
  if (!G.over && total) { Sound.reveal(total); const pts = Math.round(total * 10 * scoreMult() * comboMult()); const [x, y] = cellCenter(i); floater(x, y, '+' + fmtNum(pts)); }
}

function toggleFlag(i) {
  if (!G || G.over || G.open[i]) return;
  const el = els[i];
  if (G.flag[i]) {
    if (el.classList.contains('auto')) return;
    G.flag[i] = 0; G.flags--; el.classList.remove('flag'); el.innerHTML = ''; Sound.unflag();
  } else {
    G.flag[i] = 1; G.flags++; stats.flags++; el.classList.add('flag'); el.innerHTML = '<span class="ico paw"></span>'; Sound.flag();
    const [x, y] = cellCenter(i); burstDust(x, y, '255,194,61', 8);
  }
  const ml = $('#minesLeft'); ml.classList.remove('bump'); void ml.offsetWidth; ml.classList.add('bump');
  updateHUD();
}

function hint() {
  if (!G || G.over || G.hints <= 0) return;
  let target = -1;
  if (!G.started) {
    target = G.startCell >= 0 ? G.startCell : Math.floor(G.rows / 2) * G.cols + Math.floor(G.cols / 2);
  } else {
    const frontier = [], others = [];
    for (let i = 0; i < G.N; i++) {
      if (G.open[i] || G.mine[i] || G.flag[i]) continue;
      (neighbors(i, G.cols, G.rows).some(n => G.open[n]) ? frontier : others).push(i);
    }
    const pool = frontier.length ? frontier : others;
    if (!pool.length) return;
    // prefere zeros (abre mais área)
    const zeros = pool.filter(i => G.adj[i] === 0);
    const list = zeros.length ? zeros : pool;
    target = list[Math.floor(Math.random() * list.length)];
  }
  G.hints--; G.usedHint = true;
  G.score = Math.max(0, G.score - 250);
  Sound.hint();
  const el = els[target]; el.classList.add('hinted'); setTimeout(() => el.classList.remove('hinted'), 900);
  const [x, y] = cellCenter(target); starBurst(x, y, 14); floater(x, y - 20, '-250', 'bad');
  el.focus({ preventScroll: true }); focusIdx = target; updateRoving();
  setTimeout(() => reveal(target), 220);
  $('#hintCount').textContent = G.hints;
  $('#hintBtn').disabled = G.hints <= 0;
  updateHUD();
}

function updateHUD() {
  if (!G) return;
  $('#minesLeft').textContent = G.mines - G.flags;
  $('#scoreVal').textContent = fmtNum(G.score);
  $('#hintCount').textContent = G.hints;
  $('#hintBtn').disabled = G.hints <= 0 || G.over;
}

function checkWin() {
  if (G.over) return;
  if (G.opened === G.N - G.mines) win();
}

function endCommon() {
  if (G.started) G.elapsed = (performance.now() - G.t0) / 1000;
  G.over = true; cancelAnimationFrame(timerRAF); updateTimer();
  gameEl.classList.add('over');
  $('#timeGauge').classList.remove('warn');
  stats.played++;
}

function win() {
  endCommon(); G.won = true;
  gameEl.classList.add('st-win');
  // marca todas as minas
  let k = 0;
  for (let i = 0; i < G.N; i++) if (G.mine[i] && !G.flag[i]) { G.flag[i] = 1; const el = els[i]; setTimeout(() => { el.classList.add('flag'); el.innerHTML = '<span class="ico paw"></span>'; }, 40 * k++); }
  G.flags = G.mines; updateHUD();
  const time = G.elapsed;
  const timeBonus = G.par ? Math.max(0, G.par - time) * 20 * G.mult : 0;
  const winBonus = 1000 * scoreMult();
  const lifeBonus = G.mode === 'lives' ? G.lives * 300 : 0;
  const pureBonus = G.usedHint ? 0 : 500 * G.mult;
  const clockBonus = G.mode === 'time' ? Math.max(0, G.timeLeft) * 40 * G.mult : 0;
  G.score += Math.round(winBonus + timeBonus + lifeBonus + pureBonus + clockBonus);
  updateHUD();
  stats.wins++; stats.streak++; stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  store.set('stats', stats);
  // recordes
  let rec = false;
  if (G.mode === 'daily') {
    const k2 = 'daily:' + todayKey(), prev = store.get(k2, null);
    if (!prev || time < prev.time) { store.set(k2, { time, score: G.score }); rec = true; }
  } else if (G.diff !== 'custom') {
    const key = bestKey(G.mode, G.diff), prev = store.get(key, null);
    if (!prev || time < prev.time || G.score > prev.score) {
      store.set(key, { time: prev ? Math.min(prev.time, time) : time, score: prev ? Math.max(prev.score, G.score) : G.score });
      rec = !prev || time < prev.time;
    }
  }
  // conquistas
  unlock('first');
  if (G.diff === 'kitten' && time < 20) unlock('fast');
  if (G.diff === 'street') unlock('street');
  if (G.diff === 'panther') unlock('panther');
  if (G.mode === 'lives' && G.lives >= 7) unlock('lives');
  if (G.mode === 'time') unlock('clock');
  if (G.mode === 'dark') unlock('dark');
  if (G.mode === 'daily') unlock('daily');
  if (!G.usedHint && (G.diff === 'street' || G.diff === 'panther')) unlock('pure');
  // efeitos
  Sound.win();
  const r = boardEl.getBoundingClientRect();
  flash(r.left + r.width / 2, r.top + r.height / 2, true);
  confetti(); starBurst(r.left + r.width / 2, r.top + r.height / 2, 36);
  setTimeout(() => starBurst(r.left + r.width * .25, r.top + r.height * .3, 18), 300);
  setTimeout(() => starBurst(r.left + r.width * .75, r.top + r.height * .4, 18), 550);
  const titles = ['Território conquistado', 'Rei dos telhados', 'Patas de veludo', 'Missão miau-completa'];
  setTimeout(() => showEnd(true, titles[Math.floor(Math.random() * titles.length)], rec), 1300);
  renderAchs(); renderModes(); updateBest();
}

function lose(i, reason) {
  endCommon(); stats.streak = 0; store.set('stats', stats);
  gameEl.classList.add('st-lose');
  let ox, oy;
  if (i >= 0) {
    const el = els[i]; el.classList.add('open', 'mine', 'boom'); el.style.setProperty('--d', '0ms'); el.innerHTML = '<span class="ico bomb"></span>';
    [ox, oy] = cellCenter(i);
    explode(ox, oy, true); flash(ox, oy); Sound.boom();
  } else {
    const r = boardEl.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2; Sound.boom(); flash(ox, oy);
    if (!G.started) placeMines(-1);
  }
  shake();
  // revela as demais minas em onda a partir da explosão
  const list = [];
  const ix = i >= 0 ? i % G.cols : G.cols / 2, iy = i >= 0 ? (i / G.cols) | 0 : G.rows / 2;
  for (let c = 0; c < G.N; c++) {
    if (c === i) continue;
    if (G.mine[c] && !G.flag[c]) list.push([c, Math.hypot(c % G.cols - ix, ((c / G.cols) | 0) - iy)]);
    else if (!G.mine[c] && G.flag[c]) els[c].classList.add('wrong');
  }
  list.sort((a, b) => a[1] - b[1]);
  const span = 1400, maxD = list.length ? list[list.length - 1][1] || 1 : 1;
  list.forEach(([c, d], k) => {
    const delay = (d / maxD) * span;
    setTimeout(() => {
      const el = els[c]; el.classList.add('open', 'mine'); el.style.setProperty('--d', '0ms'); el.innerHTML = '<span class="ico bomb"></span>';
      if (k % 3 === 0) { const [x, y] = cellCenter(c); explode(x, y, false); if (k % 9 === 0) Sound.small(); }
    }, delay);
  });
  const msgs = reason === 'time'
    ? ['O tempo acabou', 'O sol nasceu antes de você terminar a ronda.']
    : G.mode === 'lives' ? ['As nove vidas se foram', 'Até gatos têm limite. Respire e tente de novo.'] : ['Miau... BOOM', 'Uma mina acordou a vizinhança inteira.'];
  setTimeout(() => showEnd(false, msgs[0], false, msgs[1]), span + 500);
  renderAchs();
}

function showEnd(won, title, rec, text) {
  const m = $('#endModal');
  $('#endCat').style.setProperty('--eye-col', won ? 'var(--eye-hot)' : 'var(--danger)');
  $('#endTitle').textContent = title;
  $('#newBest').innerHTML = won && rec ? '<span class="newbest">Novo recorde</span>' : '';
  const pct = Math.round(G.opened / (G.N - G.mines) * 100);
  $('#endText').textContent = text || (won
    ? `${MODES.find(x => x.id === G.mode).name} · ${G.diffName}. ${G.usedHint ? 'Com ajuda da Visão Felina.' : 'Sem nenhuma dica.'}`
    : `Você abriu ${pct}% do telhado.`);
  const cells = won
    ? [['Tempo', fmtTime(G.elapsed), rec], ['Pontos', fmtNum(G.score)], [G.mode === 'lives' ? 'Vidas' : 'Combo máx.', G.mode === 'lives' ? G.lives : 'x' + G.maxCombo]]
    : [['Tempo', fmtTime(G.elapsed)], ['Pontos', fmtNum(G.score)], ['Abertas', pct + '%']];
  $('#endGrid').innerHTML = cells.map(([l, v, r]) => `<div class="res${r ? ' rec' : ''}"><b>${v}</b><span>${l}</span></div>`).join('');
  m.hidden = false;
  setTimeout(() => $('#againBtn').focus(), 50);
}

/* ---------- Entrada no tabuleiro ---------- */
let press = null; // {i, timer, long, type}
function setPress(i, on) {
  if (i == null || !els[i]) return;
  els[i].classList.toggle('press', on);
  gameEl.classList.toggle('pressing', on);
  if (G.open[i] && G.adj[i]) neighbors(i, G.cols, G.rows).forEach(n => { if (!G.open[n] && !G.flag[n]) els[n].classList.toggle('peek', on); });
}
function primary(i) {
  if (!G || G.over) return;
  if (G.open[i]) { chord(i); return; }
  if (flagMode) { toggleFlag(i); return; }
  reveal(i);
}
boardEl.addEventListener('contextmenu', e => e.preventDefault());
boardEl.addEventListener('pointerdown', e => {
  const c = e.target.closest('.cell'); if (!c || !G || G.over) return;
  Sound.init();
  const i = +c.dataset.i; focusIdx = i; updateRoving();
  if (e.pointerType === 'mouse') {
    if (e.button === 2) { toggleFlag(i); return; }
    if (e.button === 1) { e.preventDefault(); chord(i); return; }
    if (e.button !== 0) return;
    press = { i, long: false, type: 'mouse' }; setPress(i, true);
  } else {
    press = { i, long: false, type: 'touch' }; setPress(i, true);
    press.timer = setTimeout(() => {
      if (!press) return; press.long = true; setPress(press.i, false);
      if (G.open[i]) chord(i); else { flagMode ? reveal(i) : toggleFlag(i); }
      try { navigator.vibrate && navigator.vibrate(18); } catch {}
    }, 360);
  }
});
addEventListener('pointerup', e => {
  if (!press) return;
  clearTimeout(press.timer); setPress(press.i, false);
  const p = press; press = null;
  if (p.long) return;
  if (p.type === 'mouse') {
    const c = document.elementFromPoint(e.clientX, e.clientY);
    const cell = c && c.closest('.cell');
    if (!cell || +cell.dataset.i !== p.i) return;
  }
  primary(p.i);
});
addEventListener('pointercancel', () => { if (press) { clearTimeout(press.timer); setPress(press.i, false); press = null; } });
boardEl.addEventListener('pointerleave', e => { if (press && press.type === 'mouse') { setPress(press.i, false); press = null; } });

// Noite Escura: máscara segue o ponteiro
function moveMask(e) {
  if (!G || G.mode !== 'dark') return;
  const r = boardEl.getBoundingClientRect();
  darkMask.style.setProperty('--mx', (e.clientX - r.left) + 'px');
  darkMask.style.setProperty('--my', (e.clientY - r.top) + 'px');
}
wrapEl.addEventListener('pointermove', moveMask);
wrapEl.addEventListener('pointerdown', moveMask);

// Inclinação 3D do tabuleiro
wrapEl.addEventListener('pointermove', e => {
  if (reduced || e.pointerType !== 'mouse' || !G || G.mode === 'dark') return;
  const r = wrapEl.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
  boardEl.style.transform = `rotateY(${px * 4}deg) rotateX(${-py * 4}deg)`;
});
wrapEl.addEventListener('pointerleave', () => { boardEl.style.transform = ''; });

// Teclado
function updateRoving() { els.forEach((e, k) => e.tabIndex = k === focusIdx ? 0 : -1); }
boardEl.addEventListener('keydown', e => {
  if (!G) return;
  const c = e.target.closest('.cell'); if (!c) return;
  let i = +c.dataset.i; const x = i % G.cols, y = (i / G.cols) | 0;
  const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (mv) {
    e.preventDefault();
    const nx = clamp(x + mv[0], 0, G.cols - 1), ny = clamp(y + mv[1], 0, G.rows - 1);
    focusIdx = ny * G.cols + nx; updateRoving(); els[focusIdx].focus();
    if (G.mode === 'dark') { const r = els[focusIdx].getBoundingClientRect(); moveMask({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }); }
  } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Sound.init(); primary(i); }
  else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFlag(i); }
});
addEventListener('keydown', e => {
  if (!gameOpen) return;
  if (!$('#endModal').hidden || !$('#confirmModal').hidden) { if (e.key === 'Escape') { $('#confirmModal').hidden = true; } return; }
  if (e.key === 'r' || e.key === 'R') { newGame(); }
  else if (e.key === 'h' || e.key === 'H') hint();
  else if (e.key === 'Escape') tryLeave();
});

/* ---------- Telas ---------- */
function setFlagMode(v) {
  flagMode = v;
  $('#flagBtn').classList.toggle('active', v);
  $('#flagBtn').setAttribute('aria-pressed', v);
  $('#flagLab').textContent = v ? 'Marcando' : 'Modo patinha';
  document.body.classList.toggle('cur-flag', v);
}
function openGame() {
  Sound.init(); Sound.meow(0, 1.1);
  gameOpen = true;
  $('#endModal').hidden = true;
  $('#game').hidden = false;
  $('#landing').setAttribute('aria-hidden', 'true');
  document.body.classList.add('no-scroll');
  newGame();
  setTimeout(() => els[0] && els[0].focus({ preventScroll: true }), 300);
}
function closeGame() {
  gameOpen = false; cancelAnimationFrame(timerRAF);
  $('#game').hidden = true; $('#endModal').hidden = true; $('#confirmModal').hidden = true;
  $('#landing').removeAttribute('aria-hidden');
  document.body.classList.remove('no-scroll', 'cur-flag');
  G = null; renderAchs(); renderModes(); updateBest();
}
function tryLeave() {
  if (G && G.started && !G.over) { $('#confirmModal').hidden = false; $('#confNo').focus(); }
  else closeGame();
}

$$('[data-play]').forEach(b => b.addEventListener('click', () => {
  if (b.closest('.nav')) { $('#modos').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); Sound.init(); Sound.click(); }
  else openGame();
}));
$('#startBtn').addEventListener('click', openGame);
$('#dailyBtn').addEventListener('click', () => { sel.mode = 'daily'; store.set('sel', sel); renderModes(); renderDiffs(); updateBest(); openGame(); });
$('#catBtn').addEventListener('click', () => { Sound.meow(0, rand(.9, 1.2)); newGame(); });
$('#redoBtn').addEventListener('click', () => newGame());
$('#backBtn').addEventListener('click', tryLeave);
$('#againBtn').addEventListener('click', () => { $('#endModal').hidden = true; newGame(); });
$('#menuBtn').addEventListener('click', closeGame);
$('#confYes').addEventListener('click', closeGame);
$('#confNo').addEventListener('click', () => { $('#confirmModal').hidden = true; });
$('#flagBtn').addEventListener('click', () => { setFlagMode(!flagMode); Sound.click(); });
$('#hintBtn').addEventListener('click', hint);
function syncAudioBtns() { $('#soundBtn').classList.toggle('off', !Sound.sfx); $('#musicBtn').classList.toggle('off', !Sound.music); $('#soundBtn').setAttribute('aria-pressed', Sound.sfx); $('#musicBtn').setAttribute('aria-pressed', Sound.music); }
$('#soundBtn').addEventListener('click', () => { Sound.toggleSfx(); syncAudioBtns(); });
$('#musicBtn').addEventListener('click', () => { Sound.toggleMusic(); syncAudioBtns(); });
document.addEventListener('mouseover', e => { const b = e.target.closest && e.target.closest('.btn, .icon-btn, .chip-btn'); if (b && !b.contains(e.relatedTarget)) Sound.hover(); });

/* ---------- Demos da seção "Como jogar" ---------- */
function demo(id, spec) {
  const host = $('#' + id); host.innerHTML = '';
  spec.forEach((s, k) => {
    const c = document.createElement('span'); c.className = 'cell';
    if (s === '.') c.className += ' open';
    else if (/\d/.test(s)) { c.className += ' open'; c.textContent = s; c.dataset.n = s; }
    else if (s === 'f') { c.className += ' flag'; c.innerHTML = '<span class="ico paw"></span>'; }
    else if (s === 'h') { c.className += ' start'; }
    c.style.setProperty('--d', k * 40 + 'ms');
    host.appendChild(c);
  });
}
demo('demo1', ['.', '.', '1', '#', '#', '.', '.', '1', '#', '#', '1', '1', '2', '#', '#']);
demo('demo2', ['1', '1', '1', '#', '#', '1', 'f', '1', '#', '#', '1', '1', '1', '#', '#']);
demo('demo3', ['#', 'f', '2', '1', '#', '#', '3', 'f', '1', '#', '#', 'f', '2', '1', '#']);
demo('demo4', ['#', '#', '#', '#', '#', '#', '1', 'h', '#', '#', '#', '#', '#', '#', '#']);

/* ---------- Revelação ao rolar + nav ---------- */
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.remove('pre'); io.unobserve(en.target); } }), { threshold: .12 }) : null;
if (io && !reduced) $$('.reveal').forEach(el => { const r = el.getBoundingClientRect(); if (r.top > innerHeight) { el.classList.add('pre'); io.observe(el); } });
addEventListener('scroll', () => { $('#nav').classList.toggle('scrolled', scrollY > 30); }, { passive: true });

/* ---------- Diário ---------- */
function syncDaily() {
  const d = store.get('daily:' + todayKey(), null);
  $('#dailyLabel').textContent = d ? `Diário ✓ ${fmtTime(d.time)}` : 'Desafio diário';
}

/* ---------- Resize ---------- */
let rzT;
function onResize() {
  W = innerWidth; H = innerHeight; DPR = Math.min(2, devicePixelRatio || 1);
  sizeFx(); buildStars(); buildCity(); if (!gameOpen) positionMoon(); fitBoard();
}
addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(onResize, 120); });

/* ---------- Início ---------- */
renderModes(); renderDiffs(); setupCustom(); updateBest(); renderAchs(); syncDaily(); syncAudioBtns();
buildClouds(); sizeFx(); buildStars(); buildCity(); positionMoon();
addEventListener('load', positionMoon);
document.fonts && document.fonts.ready.then(positionMoon);
requestAnimationFrame(skyLoop); requestAnimationFrame(fxLoop);
})();
