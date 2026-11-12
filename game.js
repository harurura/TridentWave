"use strict";
// ============================================================
//  TridentWave v0.6
//  自機固定 / 3方向(左・右・上)から来る敵 / マウスエイム自動連射
//  カード: 武装4枠 + 強化4枠、各Lv5まで
// ============================================================

const cv = document.getElementById("game");
const ctx = cv.getContext("2d");
const W = cv.width, H = cv.height;
const GY = 470;                     // 地面の高さ
const P = { x: W / 2, y: GY - 22 }; // 自機の位置(固定)

// ---- 設定(config.js)から作る一覧 ----
const EVO_OF = Object.fromEntries(EVOLUTIONS.map(v => [v.from, v]));
const CARD = Object.fromEntries(CARDS.map(c => [c.id, c]));
const TYPE_LABEL = { weapon: "武装", passive: "強化", filler: "補充", evolve: "★進化" };
const TYPE_COLOR = { weapon: "#ffb74d", passive: "#90caf9", filler: "#a5d6a7", evolve: "#ffd740" };

// ---- ゲームの長さ(MODE)を時間の設定に反映 ----
const MODE = (() => { try { const m = new URLSearchParams(location.search).get("mode"); if (MODES[m]) return m; } catch (e) {} return MODE_DEFAULT; })();
(function applyMode() {
  const k = MODES[MODE].timeScale;
  TIERS.forEach(t => t.at *= k);
  TIER_MIX.ramp *= k; FINAL.bossAt *= k; FINAL.clearAt *= k;
  SPAWN.rampPerSec /= k; SPAWN.batchEvery *= k;
  for (const d of Object.values(ENEMY)) if (d.from < 99999) d.from *= k;
})();
function clearMinutes() { return Math.round(FINAL.clearAt / 60); }

// ============================================================
//  入力
// ============================================================
const mouse = { x: W / 2, y: 200 };
cv.addEventListener("mousemove", e => {
  lastInput = performance.now();
  const r = cv.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (W / r.width);
  mouse.y = (e.clientY - r.top) * (H / r.height);
});
cv.addEventListener("contextmenu", e => e.preventDefault());
cv.addEventListener("mousedown", e => {
  lastInput = performance.now();
  sound.init();
  if (e.button === 2) { if (state === "play") useBomb(); return; }
  onClick();
});
window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  lastInput = performance.now();
  if (state === "levelup" && ["1", "2", "3"].includes(k)) chooseUpgrade(+k - 1);
  if (k === "escape" && state === "play" && tut) { finishTutorial(true); return; }        // チュートリアルをスキップ
  if (k === "escape" && (state === "over" || state === "clear")) { state = "title"; return; }  // 次の人へ交代
  if ((k === "p" || k === "escape") && (state === "play" || state === "pause")) state = state === "play" ? "pause" : "play";
  if (k === "m") sound.muted = !sound.muted;
  if (k === "t") autoAim = !autoAim;
  if (k === "d") debug = !debug;
  if ((k === " " || k === "b") && state === "play") { e.preventDefault(); useBomb(); }
  if (k === "enter") { if (state === "title") startGame(true); else if (state === "over" || state === "clear") startGame(false); }
});

// ============================================================
//  サウンド(WebAudioで簡易生成)
// ============================================================
const sound = {
  ac: null, muted: false,
  init() { if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } },
  play(freq, dur, type = "square", vol = 0.05, slide = 0) {
    if (this.muted || !this.ac) return;
    const t = this.ac.currentTime, o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ac.destination); o.start(t); o.stop(t + dur);
  },
};
const sfx = {
  shot: () => sound.play(880, 0.05, "square", 0.012, -400),
  hit: () => sound.play(220, 0.06, "triangle", 0.03, -100),
  kill: () => sound.play(160, 0.15, "sawtooth", 0.035, -120),
  hurt: () => sound.play(90, 0.3, "sawtooth", 0.08, -50),
  gem: () => sound.play(1200, 0.06, "sine", 0.025, 300),
  lvl: () => { sound.play(523, 0.12, "square", 0.05); setTimeout(() => sound.play(784, 0.18, "square", 0.05), 110); },
  item: () => sound.play(660, 0.25, "sine", 0.06, 600),
  bomb: () => sound.play(60, 0.6, "sawtooth", 0.12, -20),
  boom: () => sound.play(100, 0.2, "sawtooth", 0.04, -60),
  zap: () => sound.play(1500, 0.08, "square", 0.025, -1200),
  nova: () => sound.play(200, 0.35, "sine", 0.07, -150),
};

// ============================================================
//  ゲーム状態
// ============================================================
let state = "title";
let autoAim = false, debug = false;
let S, enemies, bullets, ebullets, gems, items, particles, texts, mines, fx, choices;
let spawnTimer, shake, lastTime = performance.now();
let lastInput = performance.now(), prevState = "title";

function startGame(withTutorial) {
  sound.init();
  S = {
    hp: 100, maxHp: 100, time: 0, kills: 0, level: 1, xp: 0, xpNext: LEVEL.base,
    cards: {}, wcool: {}, evolved: {}, bombs: BOMB.start,
    fireCool: 0, shield: 0, invuln: 0, hurtFlash: 0, aimAngle: -Math.PI / 2,
    tierShown: 0, bossDone: {}, finalSpawned: false, finalKilled: false, banner: null,
  };
  recalc();
  S.hp = S.maxHp;
  enemies = []; bullets = []; ebullets = []; gems = []; items = []; particles = []; texts = []; mines = []; fx = [];
  spawnTimer = 1; shake = 0;
  state = "play";
  tut = null;
  if (withTutorial) { tut = { step: 0 }; tutGo(0); }
}

function onClick() {
  if (state === "title") { startGame(true); return; }                            // タイトルから: チュートリアル付き
  if (state === "over" || state === "clear") { startGame(false); return; }       // リトライ: チュートリアルなし
  if (state === "levelup") {
    for (let i = 0; i < choices.length; i++) {
      const b = cardRect(i);
      if (mouse.x > b.x && mouse.x < b.x + b.w && mouse.y > b.y && mouse.y < b.y + b.h) chooseUpgrade(i);
    }
  }
}

// ---- カードのレベルから能力値を計算し直す ----
function lv(id) { return S.cards[id] || 0; }
function recalc() {
  const oldMax = S.maxHp;
  S.dmgMul = 1 + PASSIVE.power * lv("power");
  S.fireInt = 0.22 * Math.pow(PASSIVE.rate, lv("rate"));
  S.multi = 1 + lv("spread");
  S.pierce = lv("pierce");
  S.bulletR = 4 + PASSIVE.caliberSize * lv("caliber");
  S.caliberMul = 1 + PASSIVE.caliberDmg * lv("caliber");
  S.bulletSpeed = 520 * (1 - PASSIVE.caliberSpeed * lv("caliber"));
  S.boom = lv("boom");
  S.bounce = lv("bounce");
  S.maxHp = 100 + PASSIVE.armorHp * lv("armor");
  S.dmgTaken = 1 - PASSIVE.armorCut * lv("armor");
  S.regen = PASSIVE.regen * lv("regen");
  S.xpMul = 1 + PASSIVE.learn * lv("learn");
  if (S.maxHp > oldMax) S.hp += S.maxHp - oldMax;
}
function ownedOf(type) { return CARDS.filter(c => c.type === type && lv(c.id) > 0); }

// ============================================================
//  生成
// ============================================================
function spawnEnemy(type, forceSide, forceTier) {
  const d = ENEMY[type];
  const tier = forceTier != null ? forceTier : rollTier();
  const T = TIERS[tier];
  const hp = d.hp * T.hp;
  const e = { type, d, tier, T, hp, maxHp: hp, r: d.r * (1 + tier * 0.1), speed: d.speed * (0.9 + Math.random() * 0.2),
              color: tier ? mixColor(d.color, T.tint, 0.55) : d.color,
              flash: 0, t: Math.random() * 10, cool: 2 + Math.random(), spdMul: 1 };
  const side = forceSide || (Math.random() < 0.5 ? "L" : "R");
  if (d.kind === "ground") {
    e.x = side === "L" ? -e.r : W + e.r; e.y = GY - e.r;
  } else if (d.kind === "side") {
    e.x = side === "L" ? -e.r : W + e.r; e.y = 140 + Math.random() * 200; e.baseY = e.y;
  } else if (d.kind === "air") {
    e.x = 120 + Math.random() * (W - 240); e.y = -e.r;
  } else if (d.kind === "hover") {
    e.x = 100 + Math.random() * (W - 200); e.y = -e.r; e.hoverY = 70 + Math.random() * 70;
  }
  enemies.push(e);
  return e;
}

function tierShare(i) {     // 段階iの敵が混ざる割合(0〜maxShare)
  if (i === 0) return 1;
  return Math.max(0, Math.min(1, (S.time - TIERS[i].at) / TIER_MIX.ramp)) * TIER_MIX.maxShare;
}
function currentTier() { let c = 0; TIERS.forEach((T, i) => { if (S.time >= T.at) c = i; }); return c; }
function rollTier() { let t = 0; for (let i = 1; i < TIERS.length; i++) if (Math.random() < tierShare(i)) t = i; return t; }
function banner(text, color) { S.banner = { text, color, life: 3 }; }

function pickEnemyType() {
  const pool = [];
  for (const [k, w] of Object.entries(SPAWN_WEIGHT)) {
    if (S.time < ENEMY[k].from) continue;
    for (let i = 0; i < w * 2; i++) pool.push(k);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// kind: main=主砲 / ground=地上砲台 / flak=対空炸裂弾 / missile=誘導ミサイル
function fireBullet(x, y, ang, o) {
  const b = { kind: o.kind || "main", x, y, vx: Math.cos(ang) * o.speed, vy: Math.sin(ang) * o.speed, speed: o.speed,
              dmg: o.dmg, pierce: o.pierce || 0, boom: o.boom || 0, bounce: o.bounce || 0, hit: new Set(),
              r: o.r || 4, color: o.color || "#fff59d", life: o.life || 2.5 };
  Object.assign(b, o.extra || {});
  bullets.push(b);
  return b;
}

function burst(x, y, color, n = 10, sp = 160) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random());
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.3, color });
  }
}
function floatText(x, y, s, color = "#fff") { texts.push({ x, y, s, color, life: 0.8 }); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function nearestEnemy(from, filter, maxD = 1e9) {
  let best = null, bd = maxD;
  for (const e of enemies) { if (e.hp <= 0 || (filter && !filter(e))) continue; const d = dist(e, from); if (d < bd) { bd = d; best = e; } }
  return best;
}
function strongestEnemy() {
  let best = null;
  for (const e of enemies) if (e.hp > 0 && e.y > -10 && e.x > -10 && e.x < W + 10 && (!best || e.hp > best.hp)) best = e;
  return best;
}

// ============================================================
//  更新
// ============================================================
function update(dt) {
  if (!tut) S.time += dt;   // チュートリアル中は時間を進めない
  S.hp = Math.min(S.maxHp, S.hp + S.regen * dt);
  S.hurtFlash = Math.max(0, S.hurtFlash - dt);
  S.shield = Math.max(0, S.shield - dt);
  S.invuln = Math.max(0, S.invuln - dt);
  shake = Math.max(0, shake - dt * 30);
  if (S.banner) { S.banner.life -= dt; if (S.banner.life <= 0) S.banner = null; }

  // --- クリア判定 ---
  if (S.time >= FINAL.clearAt) { state = "clear"; sfx.lvl(); return; }
  if (tut) updateTutorial(dt);

  // --- 段階の切り替わり(告知 + 巨兵) ---
  const ct = currentTier();
  if (ct > S.tierShown) {
    S.tierShown = ct;
    if (!S.bossDone[ct]) { S.bossDone[ct] = true; spawnEnemy("boss", null, ct); }
    banner(`第${ct + 1}段階 ― ${TIERS[ct].name}と巨兵が来る!`, TIERS[ct].tint);
  }
  // --- 最終ボス ---
  if (!S.finalSpawned && S.time >= FINAL.bossAt) {
    S.finalSpawned = true; spawnEnemy("titan", null, TIERS.length - 1); banner("最終決戦 ― 大巨兵 襲来!", "#ff1744"); shake = 10;
  }

  // --- 敵の出現 ---
  if (!tut) spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const interval = Math.max(SPAWN.minInterval, SPAWN.startInterval - S.time * SPAWN.rampPerSec);
    spawnTimer = interval * (0.7 + Math.random() * 0.6);
    const n = 1 + Math.floor(S.time / SPAWN.batchEvery);
    for (let i = 0; i < n; i++) spawnEnemy(pickEnemyType());
  }

  // --- エイム ---
  let target = { x: mouse.x, y: mouse.y };
  if (autoAim) { const n = nearestEnemy(P); if (n) target = n; }
  let ang = Math.atan2(target.y - P.y, target.x - P.x);
  if (ang > 0.15 && ang < Math.PI - 0.15) ang = ang < Math.PI / 2 ? 0.15 : Math.PI - 0.15;  // 地面より下は狙えない
  S.aimAngle = ang;

  // --- 主砲の自動連射 ---
  S.fireCool -= dt;
  if (S.fireCool <= 0) {
    S.fireCool = S.fireInt;
    for (let i = 0; i < S.multi; i++) {
      const a = ang + (i - (S.multi - 1) / 2) * 0.12;
      fireBullet(P.x + Math.cos(a) * 26, P.y + Math.sin(a) * 26, a,
        { speed: S.bulletSpeed, dmg: S.dmgMul * S.caliberMul, pierce: S.pierce, boom: S.boom, bounce: S.bounce, r: S.bulletR });
    }
    sfx.shot();
  }

  updateWeapons(dt);
  updateBullets(dt);
  updateEnemies(dt);

  // --- 敵弾 ---
  for (const eb of ebullets) {
    eb.x += eb.vx * dt; eb.y += eb.vy * dt; eb.life -= dt;
    if (Math.hypot(P.x - eb.x, P.y - eb.y) < eb.r + 18) { eb.life = 0; hurtPlayer(eb.dmg); }
  }
  ebullets = ebullets.filter(b => b.life > 0);

  // --- 地雷 ---
  for (const m of mines) {
    m.armed -= dt;
    if (m.armed > 0) continue;
    for (const e of enemies) {
      if (e.hp > 0 && e.d.kind === "ground" && Math.abs(e.x - m.x) < e.r + 8) {
        m.dead = true; explode(m.x, GY - 12, m.radius, m.dmg, null, "#ffab40"); sfx.boom(); break;
      }
    }
  }
  mines = mines.filter(m => !m.dead);

  // --- 経験値ジェム(自機へ吸い寄せ) ---
  for (const g of gems) {
    g.t += dt;
    if (g.t < 0.4) { g.x += g.vx * dt; g.y += g.vy * dt; g.vy += 300 * dt; if (g.y > GY - 6) { g.y = GY - 6; g.vy = 0; } }
    else {
      const a = Math.atan2(P.y - g.y, P.x - g.x), sp = 250 + g.t * 400;
      g.x += Math.cos(a) * sp * dt; g.y += Math.sin(a) * sp * dt;
      if (Math.hypot(P.x - g.x, P.y - g.y) < 20) { g.dead = true; gainXp(g.v); }
    }
  }
  gems = gems.filter(g => !g.dead);

  // --- アイテム(ゆっくり漂って消える) ---
  for (const it of items) { it.t += dt; it.y += Math.sin(it.t * 2) * 10 * dt; it.x += it.vx * dt; if (it.t > 7 && !it.tut) it.dead = true; }   // チュートリアルのアイテムは消えない
  items = items.filter(i => !i.dead);

  // --- 演出 ---
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);
  for (const t of texts) { t.y -= 30 * dt; t.life -= dt; }
  texts = texts.filter(t => t.life > 0);
  for (const f of fx) f.life -= dt;
  fx = fx.filter(f => f.life > 0);

  if (S.hp <= 0) { S.hp = 0; state = "over"; sfx.bomb(); }
}

// ---- 武装 ----
function groundPos(side) { return { x: P.x + side * 70, y: GY - 14 }; }
const FLAK_POS = { x: P.x, y: GY - 78 };

function updateWeapons(dt) {
  for (const id of ["ground", "flak", "mine", "missile", "thunder", "nova"]) {
    const L = lv(id); if (!L) continue;
    S.wcool[id] = (S.wcool[id] ?? 0.3) - dt;
    if (S.wcool[id] > 0) continue;
    const Wp = WEAPON[id];
    let fired = false;

    if (id === "ground") {
      for (const side of [-1, 1]) {
        const pos = groundPos(side);
        const t = nearestEnemy(pos, e => Math.sign(e.x - P.x) === side && (e.d.kind === "ground" || e.y > GY - 140));
        if (!t) continue;
        fireBullet(pos.x, pos.y, Math.atan2(t.y - pos.y, t.x - pos.x),
          S.evolved.ground
            ? { kind: "ground", speed: 520, dmg: Wp.dmg(L) * S.dmgMul * EVOLVE.heavy.dmgMul, r: 8, color: "#ff9100",
                extra: { knock: Wp.knock(L) * EVOLVE.heavy.knockMul, blast: EVOLVE.heavy.blastRadius } }
            : { kind: "ground", speed: 520, dmg: Wp.dmg(L) * S.dmgMul, r: 5, color: "#ffcc80", extra: { knock: Wp.knock(L) } });
        fired = true;
      }
    } else if (id === "flak") {
      if (S.evolved.flak) {
        // 高射砲陣地: 近い順に複数の敵へ、貫通して何度も爆発する炸裂弾を撃つ
        const E = EVOLVE.aaBattery;
        const ts = enemies.filter(e => e.hp > 0 && e.y < GY - 150).sort((a, b) => dist(a, FLAK_POS) - dist(b, FLAK_POS)).slice(0, E.barrels);
        ts.forEach((t, i) => {
          const o = flakBarrel(i);
          fireBullet(o.x, o.y, Math.atan2(t.y - o.y, t.x - o.x),
            { kind: "flak", speed: 480, dmg: Wp.dmg(L) * S.dmgMul, r: 6, color: "#18ffff", life: 1.6, extra: { radius: Wp.radius(L) * E.radiusMul, pops: E.pops } });
        });
        fired = ts.length > 0;
      }
      const t = !S.evolved.flak && nearestEnemy(FLAK_POS, e => e.y < GY - 150);
      if (t) {
        const d = dist(t, FLAK_POS);
        fireBullet(FLAK_POS.x, FLAK_POS.y, Math.atan2(t.y - FLAK_POS.y, t.x - FLAK_POS.x),
          { kind: "flak", speed: 420, dmg: Wp.dmg(L) * S.dmgMul, r: 5, color: "#80deea", life: d / 420, extra: { radius: Wp.radius(L) } });
        fired = true;
      }
    } else if (id === "mine") {
      if (mines.length < Wp.max(L)) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = Math.max(20, Math.min(W - 20, P.x + side * (90 + Math.random() * 330)));
        mines.push({ x, armed: 0.4, dmg: Wp.dmg(L) * S.dmgMul, radius: Wp.radius(L) });
        fired = true;
      }
    } else if (id === "missile") {
      const t = strongestEnemy();
      if (t) {
        const n = Wp.count(L);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.5 + (Math.random() - 0.5) * 0.2;
          fireBullet(P.x, P.y - 10, a, { kind: "missile", speed: 300, dmg: Wp.dmg(L) * S.dmgMul, r: S.evolved.missile ? 7 : 5, color: S.evolved.missile ? "#ff3d00" : "#ff8a65", life: 4, extra: { target: t, cluster: !!S.evolved.missile } });
        }
        fired = true;
      }
    } else if (id === "thunder") {
      let cur = nearestEnemy(P, null, 400);
      if (cur) {
        const pts = [{ x: P.x, y: P.y - 10 }], hit = new Set();
        for (let i = 0; i < Wp.chain(L) && cur; i++) {
          hit.add(cur); pts.push({ x: cur.x, y: cur.y });
          damageEnemy(cur, Wp.dmg(L) * S.dmgMul);
          const from = cur;
          cur = nearestEnemy(from, e => !hit.has(e), 170);
        }
        fx.push({ type: "bolt", pts, life: 0.15 });
        sfx.zap(); fired = true;
      }
    } else if (id === "nova") {
      const R = Wp.radius(L);
      if (nearestEnemy(P, null, R)) {
        for (const e of enemies) if (e.hp > 0 && dist(e, P) < R + e.r) { damageEnemy(e, Wp.dmg(L) * S.dmgMul); knockback(e, P.x, P.y, Wp.knock(L)); }
        for (const eb of ebullets) if (dist(eb, P) < R) eb.life = 0;
        fx.push({ type: "ring", r: R, life: 0.35, max: 0.35 });
        sfx.nova(); shake = Math.max(shake, 3); fired = true;
      }
    }
    S.wcool[id] = fired ? Wp.interval(L) * (id === "ground" && S.evolved.ground ? EVOLVE.heavy.intervalMul : 1) : 0.15;
  }
}

function clusterBurst(b) {
  const E = EVOLVE.cluster;
  for (let i = 0; i < E.bomblets; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
    fireBullet(b.x, b.y, a, { kind: "bomblet", speed: 120 + Math.random() * 140, dmg: b.dmg * E.bombletDmg, r: 3, color: "#ffab40",
      life: 0.45 + Math.random() * 0.4, extra: { radius: E.bombletRadius } });
  }
}
function flakBarrel(i) { return [FLAK_POS, { x: P.x - 46, y: GY - 60 }, { x: P.x + 46, y: GY - 60 }][i] || FLAK_POS; }

function knockback(e, fx_, fy, amt) {
  if (e.d.boss) amt *= 0.15;
  if (e.d.kind === "ground") e.x += (e.x < fx_ ? -1 : 1) * amt;
  else {
    const a = Math.atan2(e.y - fy, e.x - fx_);
    e.x += Math.cos(a) * amt; e.y += Math.sin(a) * amt;
    if (e.baseY != null) e.baseY += Math.sin(a) * amt;
  }
  e.x = Math.max(-60, Math.min(W + 60, e.x));
}

// ---- 弾 ----
function updateBullets(dt) {
  for (const b of bullets) {
    // 誘導ミサイル: 目標へ向きを変える
    if (b.kind === "missile") {
      if (!b.target || b.target.hp <= 0) b.target = strongestEnemy();
      if (b.target) {
        const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
        let cur = Math.atan2(b.vy, b.vx), diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
        cur += Math.max(-5 * dt, Math.min(5 * dt, diff));
        b.vx = Math.cos(cur) * b.speed; b.vy = Math.sin(cur) * b.speed;
      }
      if (Math.random() < 0.5) particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, color: "#ffccbc" });
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;

    // 対空炸裂弾: 目標地点で炸裂
    if (b.kind === "flak" && b.life <= 0) { explode(b.x, b.y, b.radius, b.dmg, null, b.color); continue; }
    if (b.kind === "bomblet") {
      b.vy += 300 * dt;
      if (b.life <= 0 || b.y > GY) { explode(b.x, Math.min(b.y, GY - 4), b.radius, b.dmg, null, "#ffab40"); b.life = 0; continue; }
    }

    // 画面端(跳弾があれば跳ね返る)
    if (b.x < 0 || b.x > W) { if (b.bounce > 0) { b.bounce--; b.vx *= -1; b.x = Math.max(0, Math.min(W, b.x)); b.hit.clear(); } else if (b.x < -30 || b.x > W + 30) b.life = 0; }
    if (b.y < 0) { if (b.bounce > 0) { b.bounce--; b.vy *= -1; b.y = 0; b.hit.clear(); } else if (b.y < -30) b.life = 0; }
    if (b.y > GY) { if (b.bounce > 0) { b.bounce--; b.vy *= -1; b.y = GY; b.hit.clear(); } else b.life = 0; }
    if (b.life <= 0) continue;

    if (b.kind === "main") {
      for (const it of items) if (!it.dead && Math.hypot(it.x - b.x, it.y - b.y) < 16 + b.r) collectItem(it);  // アイテムは主砲で撃って取る
      for (const eb of ebullets) if (eb.life > 0 && Math.hypot(eb.x - b.x, eb.y - b.y) < eb.r + b.r) { eb.life = 0; burst(eb.x, eb.y, ENEMY_BULLET_COLOR, 5, 80); }
    }

    for (const e of enemies) {
      if (b.life <= 0) break;
      if (e.hp <= 0 || b.hit.has(e)) continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) >= e.r + b.r) continue;
      b.hit.add(e);
      if (b.kind === "flak") { explode(b.x, b.y, b.radius, b.dmg, null, b.color); if (b.pops > 1) { b.pops--; continue; } b.life = 0; break; }
      if (b.kind === "bomblet") { explode(b.x, b.y, b.radius, b.dmg, null, "#ffab40"); b.life = 0; break; }
      if (b.kind === "missile") { damageEnemy(e, b.dmg); explode(b.x, b.y, 28, b.dmg * 0.4, e, "#ff8a65"); if (b.cluster) clusterBurst(b); b.life = 0; break; }
      damageEnemy(e, b.dmg);
      if (b.kind === "ground") { if (b.blast) explode(b.x, b.y, b.blast, b.dmg * 0.6, e, "#ff9100"); knockback(e, P.x, P.y, b.knock); b.life = 0; break; }
      if (b.boom) explode(b.x, b.y, 30 + b.boom * 14, b.dmg * 0.6, e, "#ffb74d");
      if (b.pierce > 0) b.pierce--; else b.life = 0;
    }
  }
  bullets = bullets.filter(b => b.life > 0);
}

// ---- 敵 ----
function updateEnemies(dt) {
  const slowL = lv("slow");
  const slowR = slowL ? WEAPON.slow.radius(slowL) : 0, slowF = slowL ? WEAPON.slow.factor(slowL) : 0;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    e.t += dt; e.flash = Math.max(0, e.flash - dt);
    e.spdMul = slowL && dist(e, P) < slowR + e.r ? 1 - slowF : 1;
    const sp = e.speed * e.spdMul;
    const k = e.d.kind;
    if (k === "ground") {
      e.x += Math.sign(P.x - e.x) * sp * dt;
      if (Math.abs(P.x - e.x) < e.r + 20) hitPlayer(e);
    } else if (k === "side") {
      e.x += Math.sign(P.x - e.x) * sp * dt;
      if (Math.abs(P.x - e.x) < 220) e.baseY += (P.y - e.baseY) * dt * 1.5 * e.spdMul;   // 近くなったら降下
      e.y = e.baseY + Math.sin(e.t * 4) * 30;
      if (Math.hypot(P.x - e.x, P.y - e.y) < e.r + 20) hitPlayer(e);
    } else if (k === "air") {
      const a = Math.atan2(P.y - e.y, P.x - e.x);
      e.x += (Math.cos(a) * sp + Math.cos(e.t * 2.5) * 60 * e.spdMul) * dt;
      e.y += Math.sin(a) * sp * dt;
      if (Math.hypot(P.x - e.x, P.y - e.y) < e.r + 20) hitPlayer(e);
    } else if (k === "hover") {
      if (e.y < e.hoverY) e.y += sp * dt;
      e.x += Math.sin(e.t * 0.8) * 40 * dt;
      e.cool -= dt;
      if (e.cool <= 0 && e.y >= e.hoverY - 1) {
        e.cool = 3.2;
        const a = Math.atan2(P.y - e.y, P.x - e.x);
        ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, r: 7, life: 8, dmg: Math.round(10 * e.T.dmg) });
      }
    }
  }
  enemies = enemies.filter(e => e.hp > 0);
}

function damageEnemy(e, dmg) {
  if (e.hp <= 0) return;
  e.hp -= dmg; e.flash = 0.08;
  sfx.hit();
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  S.kills++;
  if (e.type === "titan") { S.finalKilled = true; banner("大巨兵 撃破!", "#ffd54f"); }
  sfx.kill();
  burst(e.x, e.y, e.color, e.d.boss ? 40 : 12);
  const n = e.d.boss ? 10 : 1;
  for (let i = 0; i < n; i++)
    gems.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 160, vy: -120 - Math.random() * 120, t: 0, v: e.d.xp * e.T.xp / n });
  // アイテムドロップ
  if (Math.random() < (e.d.boss ? 1 : 0.05)) {
    const keys = Object.keys(ITEMS);
    let type = keys[Math.floor(Math.random() * keys.length)];
    if (S.hp < S.maxHp * 0.4 && Math.random() < 0.5) type = "heart";
    items.push({ type, x: e.x, y: Math.min(e.y, GY - 60), vx: (P.x - e.x) * 0.05, t: 0 });
  }
}

function explode(x, y, radius, dmg, except, color = "#ffb74d") {
  burst(x, y, color, 8, radius * 3);
  fx.push({ type: "blast", x, y, r: radius, life: 0.2, max: 0.2, color });
  for (const e of enemies) {
    if (e === except || e.hp <= 0) continue;
    if (Math.hypot(e.x - x, e.y - y) < radius + e.r) damageEnemy(e, dmg);
  }
}

// 戻り値: "shield"=シールドで防いだ / "invuln"=無敵時間中 / "hit"=ダメージを受けた
function hurtPlayer(raw) {
  if (S.shield > 0) {   // シールド中はダメージを受けない
    floatText(P.x, P.y - 40, "ガード", "#4dd0e1"); sound.play(1000, 0.08, "triangle", 0.04, 400);
    return "shield";
  }
  if (S.invuln > 0) return "invuln";
  const dmg = Math.max(1, Math.round(raw * S.dmgTaken));
  S.hp -= dmg; S.hurtFlash = 0.3; shake = 8; sfx.hurt();
  if (tut) S.hp = Math.max(1, S.hp);   // チュートリアルでは倒れない
  floatText(P.x, P.y - 40, "-" + dmg, "#ff8a80");
  // 無敵時間を付け、周りの敵を押し返す(ダメージなし)
  S.invuln = HURT.invuln;
  for (const e of enemies) if (e.hp > 0 && dist(e, P) < HURT.pushRadius + e.r) knockback(e, P.x, P.y, HURT.push);
  fx.push({ type: "ring", r: HURT.pushRadius, life: 0.3, max: 0.3, color: "255,138,128" });
  return "hit";
}

function hitPlayer(e) {
  if (e.hp <= 0) return;
  const res = hurtPlayer(e.d.dmg * e.T.dmg);
  if (e.d.boss) { e.x += (e.x < P.x ? -1 : 1) * 160; return; }   // ボスは消えずに押し戻される
  if (res === "invuln") { knockback(e, P.x, P.y, HURT.push); return; }   // 無敵中に触れた敵は消さずに押し戻す
  e.hp = 0; burst(e.x, e.y, e.color, 14);
}

function useBomb() {
  if (S.bombs <= 0) return;
  S.bombs--;
  if (tut) tut.bombUsed = true;
  sfx.bomb(); shake = 14;
  fx.push({ type: "flash", life: 0.25, max: 0.25 });
  const dmg = BOMB.dmgPerTierHp * TIERS[currentTier()].hp;
  for (const e of enemies) damageEnemy(e, dmg);
  ebullets = [];
}

function collectItem(it) {
  it.dead = true; sfx.item();
  const I = ITEMS[it.type];
  burst(it.x, it.y, I.color, 16);
  floatText(it.x, it.y - 20, I.desc, I.color);
  if (it.type === "heart") S.hp = Math.min(S.maxHp, S.hp + 25);
  if (it.type === "shield") S.shield = SHIELD.duration;
  if (it.type === "bomb") {
    if (S.bombs < BOMB.max) S.bombs++;
    else { S.bombs++; useBomb(); }   // ストックが満タンならその場で発動
  }
}

function gainXp(v) {
  S.xp += v * S.xpMul * MODES[MODE].xpMul; sfx.gem();
  if (tut && tut.step < 2) { S.xp = Math.min(S.xp, S.xpNext - 0.01); return; }   // チュートリアル前半はレベルアップさせない
  if (S.xp >= S.xpNext) {
    S.xp -= S.xpNext; S.level++;
    S.xpNext = Math.floor(LEVEL.base + S.level * LEVEL.perLevel + Math.pow(S.level, LEVEL.pow));
    openLevelUp();
  }
}

// ---- レベルアップのカード候補 ----
function availableCards() {
  const res = [];
  for (const type of ["weapon", "passive"]) {
    const slots = type === "weapon" ? CARD_RULES.weaponSlots : CARD_RULES.passiveSlots;
    const full = ownedOf(type).length >= slots;
    for (const c of CARDS) {
      if (c.type !== type) continue;
      const L = lv(c.id);
      if (L >= CARD_RULES.maxLevel) continue;   // 最大レベル
      if (L === 0 && full) continue;            // 枠が埋まっていたら新しいカードは出ない
      res.push(c);
    }
  }
  return res;
}

function openLevelUp() {
  const rand = arr => arr.splice(Math.floor(Math.random() * arr.length), 1)[0];
  const avail = availableCards();
  // 進化できる組み合わせがあれば、最優先で候補に出す
  const pick = EVOLUTIONS.filter(v => !S.evolved[v.from] && lv(v.from) >= CARD_RULES.maxLevel && lv(v.with) >= CARD_RULES.maxLevel)
    .slice(0, 3).map(v => ({ id: "evo_" + v.id, type: "evolve", name: v.name, evo: v, desc: () => v.desc }));
  while (pick.length < 3 && avail.length) pick.push(rand(avail));
  const fillers = [CARD.heal, CARD.bombup];
  while (pick.length < 3 && fillers.length) pick.push(rand(fillers));
  // HPが減っていたら回復を候補に混ぜる
  if (S.hp < S.maxHp * 0.5 && !pick.includes(CARD.heal)) {
    if (pick.length >= 3) pick[pick.length - 1] = CARD.heal; else pick.push(CARD.heal);
  }
  if (!pick.length) { state = "play"; return; }
  choices = pick;
  state = "levelup"; sfx.lvl();
}

function chooseUpgrade(i) {
  const c = choices[i]; if (!c) return;
  if (c.id === "heal") S.hp = Math.min(S.maxHp, S.hp + S.maxHp * 0.3);
  else if (c.id === "bombup") S.bombs = Math.min(BOMB.max, S.bombs + 1);
  else if (c.type === "evolve") {
    S.evolved[c.evo.from] = true; banner(`進化! ${CARD[c.evo.from].name} → ${c.name}`, "#ffd740"); sfx.lvl();
  }
  else { S.cards[c.id] = lv(c.id) + 1; recalc(); }
  state = "play";
  if (tut) tut.chosen = true;
}

// ============================================================
//  チュートリアル(タイトルから始めたときだけ。終わるとそのまま本編へ)
// ============================================================
const TUTORIAL = [
  { title: "狙って撃つ",
    text: "マウスを向けた方向へ自動で撃ちます。左・右・上の的を壊そう",
    start() { for (const [x, y] of [[P.x - 300, GY - 70], [P.x + 300, GY - 70], [P.x, 130]]) { const e = spawnEnemy("dummy", null, 0); e.x = x; e.y = y; } },
    done: () => enemies.length === 0 },
  { title: "3方向から来る敵",
    text: "敵は左・右・上から迫ってきます。近づかれる前に倒そう",
    start() { tut.queue = [["grunt", "L", 0.3], ["grunt", "R", 1.5], ["diver", null, 2.7], ["runner", "L", 4], ["grunt", "R", 4.8], ["diver", null, 5.6]]; },
    done: () => tut.queue.length === 0 && enemies.length === 0 },
  { title: "カードで強くなる",
    text: "倒した敵が落とす経験値(ひし形の粒)が集まると、レベルアップしてカードを1枚選べます",
    start() { tut.wait = 1.5; tut.lv0 = S.level; },
    update(dt) { if (tut.wait > 0 && (tut.wait -= dt) <= 0 && S.level === tut.lv0) { S.xp = Math.max(S.xp, S.xpNext); gainXp(0); } },
    done: () => tut.chosen },
  { title: "アイテムは撃って取る",
    text: "浮かんでいるアイテムは、撃つと手に入ります。3つとも取ってみよう",
    start() {
      S.hp = Math.min(S.hp, Math.round(S.maxHp * 0.6));   // ♥の効果が分かるようにHPを減らしておく
      S.bombs = Math.min(S.bombs, BOMB.max - 1);           // Bを取ったときにストックが増えるのが見えるように
      for (const [type, x, y, caption] of [["heart", P.x - 270, 290, "HPを回復"], ["shield", P.x + 130, 320, ""], ["bomb", P.x + 300, 235, "ボムのストック+1"]])
        items.push({ type, x, y, vx: 0, t: 0, tut: true, caption: type === "shield" ? `${SHIELD.duration}秒間 無敵のシールド` : caption });
    },
    done: () => !items.some(i => i.tut) },
  { title: "ボムで切り抜ける",
    text: "囲まれたら 右クリック(または Space)でボム! 画面中の敵に大ダメージ",
    start() { S.bombs = Math.max(S.bombs, 1); tutCrowd(); },
    update() { if (!tut.bombUsed && enemies.length === 0) { S.bombs = Math.max(S.bombs, 1); tutCrowd(); } },
    done: () => tut.bombUsed },
];
let tut = null;   // チュートリアルの進行状況(本編中は null)

function tutCrowd() {
  for (let i = 0; i < 5; i++) for (const side of [-1, 1]) { const e = spawnEnemy("grunt", side < 0 ? "L" : "R", 0); e.x = P.x + side * (230 + i * 40); }
}

function tutGo(step) {
  if (step >= TUTORIAL.length) return finishTutorial(false);
  Object.assign(tut, { step, wait: 0, chosen: false, bombUsed: false, queue: [], qt: 0, doneTimer: 0 });
  TUTORIAL[step].start();
  sound.play(700, 0.1, "sine", 0.04, 200);
}

function updateTutorial(dt) {
  const st = TUTORIAL[tut.step];
  tut.qt += dt;
  while (tut.queue.length && tut.queue[0][2] <= tut.qt) { const [type, side] = tut.queue.shift(); spawnEnemy(type, side, 0); }
  if (st.update) st.update(dt);
  if (st.done()) { tut.doneTimer += dt; if (tut.doneTimer > 0.8) tutGo(tut.step + 1); }   // 少し間を置いて次へ
}

// チュートリアル終了 → 本編を最初から開始。最後まで進めた場合は選んだカードを持ち越す
function finishTutorial(skipped) {
  const keep = skipped ? null : { cards: S.cards, evolved: S.evolved, level: S.level, xp: S.xp, xpNext: S.xpNext };
  startGame(false);
  if (keep) { Object.assign(S, keep); recalc(); S.hp = S.maxHp; }
  banner(`本番スタート! ${clearMinutes()}分間 生き残れ`, "#90caf9");
}

function drawTutorial() {
  const st = TUTORIAL[tut.step]; if (!st) return;
  const w = 620, x = W / 2 - w / 2, y = 120, h = 74;
  ctx.fillStyle = "rgba(10,16,36,0.88)"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = st.done() ? "#69f0ae" : "#90caf9"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  ctx.textAlign = "left"; ctx.fillStyle = "#90caf9"; ctx.font = "bold 13px sans-serif";
  ctx.fillText(`チュートリアル ${tut.step + 1}/${TUTORIAL.length} ― ${st.title}`, x + 14, y + 22);
  ctx.textAlign = "right"; ctx.fillStyle = "#90a4ae"; ctx.font = "12px sans-serif";
  ctx.fillText("Esc: スキップして本番へ", x + w - 14, y + 22);
  ctx.textAlign = "center"; ctx.font = "bold 16px sans-serif";
  ctx.fillStyle = st.done() ? "#69f0ae" : "#fff";
  wrapText(st.done() ? "OK!" : st.text, W / 2, y + 52, w - 30, 20);
  ctx.textAlign = "left";
}

// ============================================================
//  描画
// ============================================================
function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  const grd = ctx.createLinearGradient(0, 0, 0, GY);
  grd.addColorStop(0, "#0f1424"); grd.addColorStop(1, "#1c2340");
  ctx.fillStyle = grd; ctx.fillRect(-20, -20, W + 40, GY + 20);
  ctx.fillStyle = "#2a2f45"; ctx.fillRect(-20, GY, W + 40, H - GY + 20);
  ctx.fillStyle = "#3a4060"; ctx.fillRect(-20, GY, W + 40, 3);
  ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.font = "bold 64px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("◀", 50, GY - 40); ctx.fillText("▶", W - 50, GY - 40); ctx.fillText("▼", W / 2, 70);

  if (state !== "title") drawWorld();
  ctx.restore();

  if (state === "title") drawTitle();
  if (state !== "title") drawHUD();
  if (state === "levelup") drawLevelUp();
  if (state === "pause") drawCenter("PAUSE", "P / Esc で再開");
  if (state === "over") drawCenter("GAME OVER", `生存 ${fmtTime(S.time)} ・ Lv ${S.level} ・ 撃破 ${S.kills}\n${buildText()}\nクリック / Enter: リトライ    Esc: タイトルへ(次の人へ交代)${idleNote()}`);
  if (state === "clear") drawCenter("CLEAR!", `${clearMinutes()}分間 生き残った! ・ Lv ${S.level} ・ 撃破 ${S.kills}\n大巨兵: ${S.finalKilled ? "撃破" : "撃破ならず"}\n${buildText()}\nクリック / Enter: もう一度    Esc: タイトルへ(次の人へ交代)${idleNote()}`);
  drawCrosshair();
}

function idleNote() {   // 放置されているとき、タイトルへ戻るまでの残り秒数
  const left = EVENT.idleToTitle - (performance.now() - lastInput) / 1000;
  return left < 10 ? `\n${Math.ceil(Math.max(0, left))}秒後にタイトルへ戻ります` : "";
}

function buildText() {
  const list = CARDS.filter(c => lv(c.id) > 0).map(c => S.evolved[c.id] ? `★${EVO_OF[c.id].name}` : `${c.name}${lv(c.id)}`);
  return list.length ? "ビルド: " + list.join(" / ") : "ビルド: なし";
}

function drawWorld() {
  // 減速フィールド
  if (lv("slow")) {
    const R = WEAPON.slow.radius(lv("slow"));
    ctx.beginPath(); ctx.arc(P.x, P.y, R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(100,181,246,0.07)"; ctx.fill();
    ctx.strokeStyle = "rgba(100,181,246,0.35)"; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
  }
  // 地雷
  for (const m of mines) {
    ctx.fillStyle = m.armed > 0 ? "#795548" : "#ffab40";
    ctx.fillRect(m.x - 9, GY - 5, 18, 5);
    if (m.armed <= 0 && Math.floor(S.time * 4) % 2) { ctx.fillStyle = "#ff5252"; ctx.fillRect(m.x - 2, GY - 8, 4, 3); }
  }
  for (const g of gems) { ctx.fillStyle = "#69f0ae"; diamond(g.x, g.y, 5); }
  for (const it of items) {
    const I = ITEMS[it.type];
    if (!it.tut && it.t > 5 && Math.floor(it.t * 8) % 2) continue;
    ctx.beginPath(); ctx.arc(it.x, it.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = I.color; ctx.stroke();
    ctx.fillStyle = I.color; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(I.label, it.x, it.y + 1); ctx.textBaseline = "alphabetic";
    if (it.caption) { ctx.font = "bold 13px sans-serif"; ctx.fillText(it.caption, it.x, it.y + 34); }   // チュートリアル用の説明
  }
  for (const e of enemies) drawEnemy(e);
  for (const eb of ebullets) drawEnemyBullet(eb);
  // 砲台
  if (lv("ground")) for (const side of [-1, 1]) {
    const p = groundPos(side);
    if (S.evolved.ground) { ctx.fillStyle = "#ff9100"; ctx.fillRect(p.x - 14, p.y - 12, 28, 26); ctx.fillStyle = "#ffd740"; ctx.fillRect(p.x - 14, p.y - 12, 28, 3); }
    else { ctx.fillStyle = "#ffb74d"; ctx.fillRect(p.x - 10, p.y - 6, 20, 20); }
    ctx.fillStyle = "#0b0d14"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.fillText(lv("ground"), p.x, p.y + 8);
  }
  if (S.evolved.flak) for (let i = 1; i < 3; i++) {
    const p = flakBarrel(i);
    ctx.fillStyle = "#37474f"; ctx.fillRect(p.x - 3, p.y, 6, GY - p.y);
    ctx.fillStyle = "#18ffff"; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
  }
  if (lv("flak")) {
    const p = FLAK_POS;
    ctx.fillStyle = "#37474f"; ctx.fillRect(p.x - 3, p.y, 6, GY - p.y);
    ctx.fillStyle = S.evolved.flak ? "#18ffff" : "#4dd0e1"; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0b0d14"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.fillText(lv("flak"), p.x, p.y + 4);
  }
  // 弾
  for (const b of bullets) {
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    if (b.kind === "missile") { ctx.strokeStyle = "#bf360c"; ctx.lineWidth = 2; ctx.stroke(); }
  }
  drawPlayer();
  // エフェクト
  for (const f of fx) {
    if (f.type === "bolt") {
      ctx.strokeStyle = "#fff59d"; ctx.lineWidth = 3; ctx.globalAlpha = f.life / 0.15;
      ctx.beginPath(); ctx.moveTo(f.pts[0].x, f.pts[0].y);
      for (let i = 1; i < f.pts.length; i++) {
        const a = f.pts[i - 1], b = f.pts[i];
        const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 30, my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 30;
        ctx.lineTo(mx, my); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    } else if (f.type === "ring") {
      const k = 1 - f.life / f.max;
      ctx.strokeStyle = `rgba(${f.color || "144,202,249"},${f.life / f.max})`; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(P.x, P.y, 20 + (f.r - 20) * k, 0, Math.PI * 2); ctx.stroke();
    } else if (f.type === "blast") {
      ctx.globalAlpha = (f.life / f.max) * 0.35; ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life * 1.5); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
  ctx.globalAlpha = 1;
  ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
  for (const t of texts) { ctx.globalAlpha = Math.min(1, t.life * 2); ctx.fillStyle = t.color; ctx.fillText(t.s, t.x, t.y); }
  ctx.globalAlpha = 1;
  for (const f of fx) if (f.type === "flash") { ctx.fillStyle = `rgba(255,245,200,${(f.life / f.max) * 0.6})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
  if (S.hurtFlash > 0) { ctx.fillStyle = `rgba(255,0,0,${S.hurtFlash * 0.5})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
}

// 敵弾の見た目。自機側の弾は丸、敵弾だけは とげのある星形 にして、色が見分けにくくても形で分かるようにする
const ENEMY_BULLET_COLOR = "#ff3ddc";   // マゼンタ: 色覚の型を問わず、自機の弾(淡い黄)や経験値と混ざりにくい
function drawEnemyBullet(eb) {
  const spikes = 8, r1 = eb.r + 4, r2 = eb.r - 1, rot = performance.now() / 300;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 ? r2 : r1, a = rot + (i * Math.PI) / spikes;
    ctx.lineTo(eb.x + Math.cos(a) * r, eb.y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = ENEMY_BULLET_COLOR; ctx.fill();
  ctx.strokeStyle = "#1a0016"; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r * 0.4, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
}

function drawEnemy(e) {
  ctx.fillStyle = e.flash > 0 ? "#ffffff" : e.color;
  const k = e.d.kind;
  if (k === "ground") {
    ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    ctx.fillStyle = "#111"; const dir = Math.sign(P.x - e.x);
    ctx.fillRect(e.x + dir * e.r * 0.3 - 3, e.y - e.r * 0.4, 6, 6);
  } else if (k === "side") {
    const wing = Math.sin(e.t * 18) * 8;
    ctx.beginPath(); ctx.moveTo(e.x - e.r * 1.8, e.y + wing); ctx.lineTo(e.x, e.y - 4); ctx.lineTo(e.x + e.r * 1.8, e.y + wing); ctx.lineTo(e.x, e.y + e.r); ctx.closePath(); ctx.fill();
  } else if (k === "air") {
    ctx.beginPath(); ctx.moveTo(e.x, e.y + e.r * 1.3); ctx.lineTo(e.x - e.r, e.y - e.r); ctx.lineTo(e.x + e.r, e.y - e.r); ctx.closePath(); ctx.fill();
  } else if (k === "dummy") {
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = e.flash > 0 ? "#fff" : "#e53935"; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#eceff1"; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.28, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1b5e20"; ctx.beginPath(); ctx.arc(e.x, e.y + 4, e.r * 0.45, 0, Math.PI * 2); ctx.fill();
  }
  if (e.tier > 0) {   // 上位種は輪で示す。色だけに頼らないよう、段階の数だけ輪を重ねる(強化1本・精鋭2本・異形3本)
    ctx.strokeStyle = e.T.tint; ctx.lineWidth = 2;
    for (let i = 0; i < e.tier; i++) { ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5 + i * 5, 0, Math.PI * 2); ctx.stroke(); }
  }
  if (e.spdMul < 1) { ctx.fillStyle = "#64b5f6"; ctx.fillRect(e.x - 3, e.y + e.r + 3, 6, 3); }  // 減速中の印
  if (e.hp < e.maxHp) {
    const w = e.r * 2;
    ctx.fillStyle = "#000a"; ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w, 4);
    ctx.fillStyle = "#ff5252"; ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w * Math.max(0, e.hp / e.maxHp), 4);
  }
}

function drawPlayer() {
  if (S.invuln > 0 && Math.floor(S.invuln * 15) % 2) ctx.globalAlpha = 0.35;   // 無敵中は点滅
  ctx.fillStyle = "#455a64"; ctx.fillRect(P.x - 28, GY - 12, 56, 12);
  ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(S.aimAngle);
  ctx.fillStyle = "#cfd8dc"; ctx.fillRect(0, -5 - lv("caliber") * 0.6, 30, 10 + lv("caliber") * 1.2);
  ctx.restore();
  ctx.beginPath(); ctx.arc(P.x, P.y, 18, 0, Math.PI * 2);
  ctx.fillStyle = S.hurtFlash > 0 ? "#ff8a80" : "#90caf9"; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "#1e88e5"; ctx.stroke();
  ctx.globalAlpha = 1;
  if (S.shield > 0 && !(S.shield < 2 && Math.floor(S.shield * 8) % 2)) {
    const r = 32 + Math.sin(S.time * 6) * 2;
    ctx.beginPath(); ctx.arc(P.x, P.y - 4, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(77,208,225,0.15)"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(77,208,225,0.85)"; ctx.stroke();
  }
}

function drawHUD() {
  // HP
  const low = S.hp / S.maxHp < 0.3;
  const blink = low && Math.floor(performance.now() / 250) % 2;
  ctx.fillStyle = blink ? "#ffffff55" : "#000a"; ctx.fillRect(16, 14, 244, 18);
  ctx.fillStyle = low ? "#d55e00" : "#009e73"; ctx.fillRect(18, 16, 240 * Math.max(0, S.hp) / S.maxHp, 14);
  ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "left";
  ctx.fillText(`HP ${Math.ceil(S.hp)} / ${S.maxHp}${low ? "  ! 危険" : ""}`, 24, 28);
  drawBombStock();
  // 所持カード
  let y = 56;
  for (const type of ["weapon", "passive"]) {
    const owned = ownedOf(type), slots = type === "weapon" ? CARD_RULES.weaponSlots : CARD_RULES.passiveSlots;
    ctx.fillStyle = TYPE_COLOR[type]; ctx.font = "bold 12px sans-serif";
    ctx.fillText(`${TYPE_LABEL[type]} ${owned.length}/${slots}`, 18, y); y += 16;
    ctx.font = "12px sans-serif"; ctx.fillStyle = "#b0bec5";
    for (const c of owned) {
      if (S.evolved[c.id]) { ctx.fillStyle = "#ffd740"; ctx.fillText(`★${EVO_OF[c.id].name}`, 26, y); ctx.fillStyle = "#b0bec5"; }
      else ctx.fillText(`${c.name} ${"■".repeat(lv(c.id))}${"□".repeat(CARD_RULES.maxLevel - lv(c.id))}`, 26, y);
      y += 15;
    }
    y += 6;
  }
  // XP
  ctx.fillStyle = "#000a"; ctx.fillRect(0, H - 8, W, 8);
  ctx.fillStyle = "#69f0ae"; ctx.fillRect(0, H - 8, W * Math.min(1, S.xp / S.xpNext), 8);
  // 右上の情報
  ctx.textAlign = "right"; ctx.font = "bold 16px sans-serif"; ctx.fillStyle = "#fff";
  ctx.fillText(tut ? "チュートリアル" : `${fmtTime(S.time)} / ${fmtTime(FINAL.clearAt)}`, W - 16, 30);
  ctx.font = "13px sans-serif";
  ctx.fillStyle = TIERS[currentTier()].tint; ctx.fillText(`第${currentTier() + 1}段階`, W - 130, 50);
  ctx.fillStyle = "#cfd8dc"; ctx.fillText(`Lv ${S.level}   撃破 ${S.kills}`, W - 16, 50);
  if (S.shield > 0) { ctx.fillStyle = "#4dd0e1"; ctx.fillText(`シールド ${S.shield.toFixed(1)}s`, W - 16, 70); }
  ctx.textAlign = "left"; ctx.fillStyle = "#78909c"; ctx.font = "12px sans-serif";
  ctx.fillText(`[T] エイム: ${autoAim ? "オート" : "マウス"}   [P] ポーズ   [M] 音 ${sound.muted ? "OFF" : "ON"}   [D] 数値表示`, 16, H - 16);
  if (tut) drawTutorial();
  drawBanner();
  if (debug) drawDebug();
}

// ボムの残り: 自機の真下に表示。増えたときは光らせ、囲まれているときは使い方を出す
let prevBombs = 0, bombPulse = 0;
function drawBombStock() {
  if (S.bombs > prevBombs) bombPulse = 0.8;
  prevBombs = S.bombs;
  bombPulse = Math.max(0, bombPulse - 1 / 60);
  const cx = P.x, cy = GY + 26, gap = 30, x0 = cx - ((BOMB.max - 1) * gap) / 2;
  ctx.textAlign = "right"; ctx.font = "bold 14px sans-serif"; ctx.fillStyle = "#f0e442";
  ctx.fillText("ボム", x0 - 18, cy + 5);
  for (let i = 0; i < BOMB.max; i++) {
    const x = x0 + i * gap, have = i < S.bombs, r = 9 + (have && bombPulse > 0 ? bombPulse * 4 : 0);
    ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2);
    if (have) { ctx.fillStyle = "#f0e442"; ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = "#f0e442"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 5, cy - 7); ctx.lineTo(x + 9, cy - 13); ctx.stroke(); }  // 導火線
    else { ctx.strokeStyle = "#f0e44266"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); }
  }
  ctx.textAlign = "left"; ctx.font = "12px sans-serif"; ctx.fillStyle = "#b0bec5";
  ctx.fillText("右クリック / Space", x0 + (BOMB.max - 1) * gap + 18, cy + 4);
  // 囲まれているときの合図(ボムを持っているときだけ)
  if (state === "play" && S.bombs > 0) {
    let near = 0; for (const e of enemies) if (e.hp > 0 && dist(e, P) < 170) near++;
    if (near >= 6 && Math.floor(performance.now() / 300) % 2) {
      ctx.textAlign = "center"; ctx.font = "bold 18px sans-serif"; ctx.fillStyle = "#f0e442";
      ctx.strokeStyle = "#000"; ctx.lineWidth = 4; ctx.strokeText("右クリックでボム!", P.x, GY - 112); ctx.fillText("右クリックでボム!", P.x, GY - 112);
    }
  }
  ctx.textAlign = "left";
}

function cardRect(i) { const w = 250, h = 190, gap = 22, x0 = (W - (w * 3 + gap * 2)) / 2; return { x: x0 + i * (w + gap), y: 170, w, h }; }

function drawLevelUp() {
  ctx.fillStyle = "rgba(5,8,16,0.8)"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff"; ctx.font = "bold 32px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(`LEVEL UP!  Lv ${S.level}`, W / 2, 112);
  ctx.font = "14px sans-serif"; ctx.fillStyle = "#b0bec5";
  ctx.fillText(`カードを1枚選ぶ(クリック または 1〜3キー)    武装 ${ownedOf("weapon").length}/${CARD_RULES.weaponSlots} ・ 強化 ${ownedOf("passive").length}/${CARD_RULES.passiveSlots}`, W / 2, 144);
  choices.forEach((c, i) => {
    const b = cardRect(i);
    const hover = mouse.x > b.x && mouse.x < b.x + b.w && mouse.y > b.y && mouse.y < b.y + b.h;
    const col = TYPE_COLOR[c.type];
    ctx.fillStyle = hover ? "#263259" : "#1a2140"; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = hover ? col : "#3a4570"; ctx.lineWidth = 2; ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = col; ctx.fillRect(b.x, b.y, b.w, 4);
    ctx.textAlign = "left"; ctx.font = "bold 12px sans-serif"; ctx.fillText(`[${i + 1}] ${TYPE_LABEL[c.type]}`, b.x + 12, b.y + 24);
    const L = lv(c.id);
    ctx.textAlign = "right";
    if (c.type === "weapon" || c.type === "passive") {
      ctx.fillStyle = L === 0 ? "#ffeb3b" : "#b0bec5";
      ctx.fillText(L === 0 ? "NEW!" : `Lv ${L} → ${L + 1}`, b.x + b.w - 12, b.y + 24);
    }
    ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "bold 21px sans-serif";
    ctx.fillText(c.name, b.x + b.w / 2, b.y + 60);
    ctx.fillStyle = "#cfd8dc"; ctx.font = "13px sans-serif";
    if (c.type === "evolve") {
      ctx.fillStyle = "#ffd740"; ctx.fillText(`${CARD[c.evo.from].name} + ${CARD[c.evo.with].name}`, b.x + b.w / 2, b.y + 86);
      ctx.fillStyle = "#cfd8dc"; wrapText(c.desc(), b.x + b.w / 2, b.y + 112, b.w - 28, 18);
      return;
    }
    let y = wrapText(c.desc(), b.x + b.w / 2, b.y + 92, b.w - 28, 18);
    if (c.type === "weapon" && L > 0) { ctx.fillStyle = col; y = wrapText("Lvアップ: " + c.up, b.x + b.w / 2, y + 8, b.w - 28, 18); }
    // 進化の組み合わせのヒント
    const hint = EVOLUTIONS.find(v => !S.evolved[v.from] && ((c.id === v.with && lv(v.from) > 0) || (c.id === v.from && lv(v.with) > 0)));
    if (hint) { ctx.fillStyle = "#ffd740"; ctx.font = "12px sans-serif"; wrapText(`★両方Lv5で「${hint.name}」に進化`, b.x + b.w / 2, Math.max(y + 8, b.y + b.h - 22), b.w - 20, 16); }
  });
  if (tut) {
    ctx.textAlign = "center"; ctx.fillStyle = "#ffd740"; ctx.font = "bold 15px sans-serif";
    ctx.fillText("カードは 武装4種類・強化4種類 まで持てます。何を選ぶかで戦い方が変わる!", W / 2, 400);
  }
}

function wrapText(text, cx, y, maxW, lh) {
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, cx, y); line = ch; y += lh; }
    else line += ch;
  }
  if (line) { ctx.fillText(line, cx, y); y += lh; }
  return y;
}

function drawTitle() {
  ctx.fillStyle = "rgba(5,8,16,0.6)"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.fillStyle = "#90caf9"; ctx.font = "bold 56px sans-serif";
  ctx.fillText("TRIDENT WAVE", W / 2, 150);
  ctx.fillStyle = "#cfd8dc"; ctx.font = "16px sans-serif";
  const lines = [
    "左・右・上から押し寄せる敵から、動けない砲台を守り抜け",
    "マウスで狙う方向へ自動で連射 / レベルアップでカードを選んで強化",
    "カードは 武装4種類・強化4種類 まで。何に絞るかで戦い方が変わる",
    "右クリック(Space)でボム / 浮かんでいるアイテムは撃って取る",
    `${clearMinutes()}分間生き残ればクリア。${fmtTime(FINAL.bossAt)}には最後の大ボスが来る`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 215 + i * 28));
  ctx.fillStyle = "#fff"; ctx.font = "bold 22px sans-serif";
  if (Math.floor(performance.now() / 500) % 2) ctx.fillText("クリックでスタート(チュートリアルから始まります)", W / 2, 400);
  if (MODE !== "normal") { ctx.fillStyle = "#ffd740"; ctx.font = "bold 16px sans-serif"; ctx.fillText(`― ${MODES[MODE].label} ―`, W / 2, 186); }
}

function drawCenter(title, sub) {
  ctx.fillStyle = "rgba(5,8,16,0.75)"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "bold 48px sans-serif";
  ctx.fillText(title, W / 2, 200);
  ctx.font = "17px sans-serif"; ctx.fillStyle = "#cfd8dc";
  let y = 250;
  for (const l of sub.split("\n")) y = wrapText(l, W / 2, y, W - 120, 26) + 4;
}

function drawBanner() {
  const b = S.banner; if (!b) return;
  ctx.globalAlpha = Math.min(1, b.life);
  ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 96, W, 44);
  ctx.fillStyle = b.color; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(b.text, W / 2, 126); ctx.globalAlpha = 1; ctx.textAlign = "left";
}

function drawDebug() {   // [D]キーで表示。数値調整の目安
  const fi = S.fireInt;
  const interval = Math.max(SPAWN.minInterval, SPAWN.startInterval - S.time * SPAWN.rampPerSec);
  const shares = TIERS.map((T, i) => { let p = tierShare(i); for (let j = i + 1; j < TIERS.length; j++) p *= 1 - tierShare(j); return p; });
  const lines = [
    `主砲の秒間ダメージ目安: ${(S.dmgMul * S.caliberMul * S.multi / fi).toFixed(1)}(全弾命中時)`,
    `1発: ${(S.dmgMul * S.caliberMul).toFixed(2)} / 弾数 ${S.multi} / 貫通 ${S.pierce} / 跳弾 ${S.bounce}`,
    `出現間隔: ${interval.toFixed(2)}秒 × ${1 + Math.floor(S.time / SPAWN.batchEvery)}体 / 画面上の敵 ${enemies.length}体`,
    `次のレベルまで: ${Math.ceil(S.xpNext - S.xp)} / ${S.xpNext}(経験値×${S.xpMul.toFixed(2)})`,
    ...TIERS.map((T, i) => `${T.name}(HP×${T.hp}): ${Math.round(shares[i] * 100)}%`),
  ];
  ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.fillRect(W - 330, 80, 320, 14 + lines.length * 17);
  ctx.font = "12px sans-serif"; ctx.textAlign = "left"; ctx.fillStyle = "#e0e0e0";
  lines.forEach((l, i) => ctx.fillText(l, W - 320, 98 + i * 17));
}

function drawCrosshair() {
  const { x, y } = mouse;
  ctx.strokeStyle = autoAim && state === "play" ? "#78909c" : "#ff5252"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.moveTo(x - 16, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 16, y);
  ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 16);
  ctx.stroke();
}

function mixColor(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function diamond(x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); }
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, "0")}`; }

// ============================================================
//  メインループ
// ============================================================
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (state === "play") update(dt);
  if ((state === "over" || state === "clear") && prevState !== state) lastInput = now;   // 終了画面に入った時点から数える
  if ((state === "over" || state === "clear") && now - lastInput > EVENT.idleToTitle * 1000) state = "title";
  prevState = state;
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// デバッグ用(ブラウザのコンソールから確認できる)
window.__tw = { EVOLUTIONS, get tut() { return tut; }, MODE, FINAL, get S() { return S; }, get enemies() { return enemies; }, get state() { return state; }, startGame, CARDS, recalc };
