"use strict";
// ============================================================
//  TridentWave v0.8
//  自機固定 / 3方向(左・右・上)から来る敵 / マウスエイム自動連射
//  カード: 武装4枠 + 強化4枠、各Lv5まで
// ============================================================

const cv = document.getElementById("game");
const ctx = cv.getContext("2d");
const W = cv.width, H = cv.height;
const GY = 470;                     // 地面の高さ
const P = { x: W / 2, y: GY - PLAYER_ART.body.height / 2 };   // 自機の中心(当たり判定の中心)
// 砲身の回転軸(弾はここから出る)。本体画像の中の位置から計算する
const AIM = { x: P.x - PLAYER_ART.body.width / 2 + PLAYER_ART.body.width * PLAYER_ART.pivot.x,
              y: GY - PLAYER_ART.body.height + PLAYER_ART.body.height * PLAYER_ART.pivot.y };
const MUZZLE = PLAYER_ART.barrel.length * (1 - PLAYER_ART.barrel.pivotX);   // 回転軸から砲口までの長さ
const PR = PLAYER_ART.hitRadius;

// ---- 画像の読み込み ----
function loadImg(src, displayW) {
  const im = new Image();
  im.onload = () => { im.ok = true; im.white = whiteVersion(im); bakePaper(im, displayW); };
  im.onerror = () => console.warn("画像を読み込めませんでした(図形で代用します):", src);
  im.src = src;
  return im;
}
function whiteVersion(im) {   // 被弾時の白い点滅用に、同じ形の真っ白な画像を作っておく
  const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext("2d"); g.drawImage(im, 0, 0);
  g.globalCompositeOperation = "source-atop"; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  return c;
}
// 同じ形を1色で塗りつぶした画像(影やフチの材料)
function silhouette(src, color) {
  const c = document.createElement("canvas"); c.width = src.naturalWidth || src.width; c.height = src.naturalHeight || src.height;
  const g = c.getContext("2d"); g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-atop"; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}
// 紙風: 白いフチ付きの画像と、その影・白い点滅用を一度だけ作っておく(遊んでいる最中の負担を増やさないため)
function bakePaper(im, displayW) {
  const b = Math.ceil(PAPER.border * im.naturalWidth / displayW);
  im.paper = bakeBorder(im, b, PAPER.borderColor);
  im.paperGold = bakeBorder(im, b, TURRET_ART.evolvedBorder);   // 進化した砲台用
  im.paperShadow = silhouette(im.paper, "#000"); im.paperWhite = silhouette(im.paper, "#fff");
}
function bakeBorder(im, b, color) {
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  const c = document.createElement("canvas"); c.width = iw + b * 2; c.height = ih + b * 2;
  const g = c.getContext("2d"), sil = silhouette(im, color);
  for (const rr of [b, b * 0.5]) for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.drawImage(sil, b + Math.cos(a) * rr, b + Math.sin(a) * rr); }
  g.drawImage(im, b, b);
  return c;
}
const ART = { body: loadImg(PLAYER_ART.body.src, PLAYER_ART.body.width), barrel: loadImg(PLAYER_ART.barrel.src, PLAYER_ART.barrel.length) };
const TART = { ground: loadImg(TURRET_ART.ground.src, TURRET_ART.ground.width), flak: loadImg(TURRET_ART.flak.src, TURRET_ART.flak.width) };

// 敵の画像: 段階ごとに色を重ねた版と、その白フチ・影・白い点滅用を読み込み時に作っておく
function tinted(im, color, amount) {
  const c = document.createElement("canvas"); c.width = im.naturalWidth || im.width; c.height = im.naturalHeight || im.height;
  const g = c.getContext("2d"); g.drawImage(im, 0, 0);
  g.globalCompositeOperation = "source-atop"; g.globalAlpha = amount; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}
function loadEnemyImg(a) {
  const im = new Image();
  im.onload = () => {
    im.dispW = a.height * im.naturalWidth / im.naturalHeight;   // 画面上の幅
    // 毎回大きな画像を縮めて描くと重いので、表示サイズ(×spriteQuality)に縮めた画像を作っておく
    const q = PERF.spriteQuality, small = document.createElement("canvas");
    small.width = Math.round(im.dispW * q * 1.3); small.height = Math.round(a.height * q * 1.3);   // 上位種は最大1.3倍に大きくなる
    const sg = small.getContext("2d"); sg.imageSmoothingQuality = "high"; sg.drawImage(im, 0, 0, small.width, small.height);
    const b = Math.ceil(PAPER.border * small.height / a.height);
    im.tiers = TIERS.map((T, i) => {
      const base = i ? tinted(small, T.tint, ENEMY_TINT) : small;
      const paper = bakeBorder(base, b, PAPER.borderColor);
      return { plain: base, paper, shadow: silhouette(paper, "#000"), white: silhouette(base, "#fff"), paperWhite: silhouette(paper, "#fff") };
    });
    im.ok = true;
  };
  im.onerror = () => console.warn("画像を読み込めませんでした(図形で代用します):", a.src);
  im.src = a.src;
  return im;
}
const EART = Object.fromEntries(Object.entries(ENEMY_ART).map(([k, a]) => [k, loadEnemyImg(a)]));

// 背景: 読み込み時に一度だけ、ぼかし・暗さを調整した画像を作っておく(遊んでいる最中は貼るだけ)
function loadBg(B) {
  const im = new Image();
  im.onload = () => {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    const hasFilter = "filter" in g;
    if (hasFilter) g.filter = `blur(${B.blur}px) brightness(${B.brightness}) saturate(${B.saturate})`;
    // 左右半分に分けて外側へずらし、下端を地面の少し下に合わせる
    const nw = im.naturalWidth, nh = im.naturalHeight, s = (W / nw) * (B.scale ?? 1), dw = nw * s, dh = nh * s;
    const x0 = (W - dw) / 2, y0 = GY + (B.sinkY ?? 0) - dh, sp = B.spread ?? 0;
    g.drawImage(im, 0, 0, nw / 2, nh, x0 - sp, y0, dw / 2, dh);
    g.drawImage(im, nw / 2, 0, nw / 2, nh, x0 + dw / 2 + sp, y0, dw / 2, dh);
    if (hasFilter) g.filter = "none";
    g.globalCompositeOperation = "source-atop";   // 以下は描いた絵の上だけを暗くする
    if (!hasFilter) { g.fillStyle = `rgba(0,0,0,${1 - B.brightness})`; g.fillRect(0, 0, W, H); }   // ぼかしが使えないブラウザでは暗くするだけ
    if (B.floorShade) {   // 地面近く(敵が歩く高さ)を暗くして、手前の敵を浮かせる
      const fg = g.createLinearGradient(0, GY - 140, 0, GY);
      fg.addColorStop(0, "rgba(0,0,0,0)"); fg.addColorStop(1, `rgba(0,0,0,${B.floorShade})`);
      g.fillStyle = fg; g.fillRect(0, GY - 140, W, H);
    }
    if (B.centerShade) {  // 中央(自機のまわり)を暗くする
      const cg = g.createLinearGradient(W / 2 - 300, 0, W / 2 + 300, 0);
      cg.addColorStop(0, "rgba(0,0,0,0)"); cg.addColorStop(0.5, `rgba(0,0,0,${B.centerShade})`); cg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = cg; g.fillRect(0, 0, W, H);
    }
    im.baked = c; im.ok = true;
  };
  im.onerror = () => console.warn("背景を読み込めませんでした:", B.src);
  im.src = B.src;
  return im;
}
const BG = { middle: loadBg(BG_ART.middle) };

// ---- 背景: 子ども部屋のジオラマ(壁・床・小物を読み込み時に1枚へ焼き付ける) ----
const ROOM = { imgs: {}, pending: 0, failed: false, ready: false, baked: [], cur: -1, prev: -1, fade: 1, last: 0 };
function roomImg(src) {
  if (ROOM.imgs[src]) return;
  const im = new Image(); ROOM.pending++;
  const done = () => { if (--ROOM.pending === 0) bakeRoom(); };
  im.onload = done;
  im.onerror = () => { ROOM.failed = true; console.warn("背景の画像を読み込めませんでした(前の背景を使います):", src); done(); };
  im.src = src; ROOM.imgs[src] = im;
}
if (BG_ROOM.enable) {
  roomImg(BG_ROOM.wall.src); roomImg(BG_ROOM.floor.src);
  BG_ROOM.props.forEach(p => roomImg(p.src));
  if (BG_ROOM.front) roomImg(BG_ROOM.front.src);   // オンオフを途中で切り替えられるよう、無効でも読み込んでおく
}
let frontOn = !!BG_ROOM.front?.enable;   // [F]キーで手前の積み木を切り替え
function newCanvas() { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; }

function bakeRoom() {
  if (ROOM.failed) return;
  const R = BG_ROOM, I = ROOM.imgs;
  const raw = newCanvas(), g = raw.getContext("2d");
  // 壁: 右半分はそのまま、左半分は左右反転して、まん中でつなぐ(窓が左右に1つずつ)
  const wim = I[R.wall.src], ws = R.wall.height / wim.naturalHeight, ww = wim.naturalWidth * ws;
  g.drawImage(wim, W / 2, 0, ww, R.wall.height);
  g.save(); g.translate(W / 2, 0); g.scale(-1, 1); g.drawImage(wim, 0, 0, ww, R.wall.height); g.restore();
  // 床: 1行ずつ、手前ほど大きく貼って遠近感を出す
  const F = R.floor, fim = I[F.src], tw = fim.naturalWidth, th = fim.naturalHeight, D0 = F.top - F.vanishY;
  for (let y = F.top; y < H; y++) {
    const d = y + 0.5 - F.vanishY, k = d / D0;
    const v = Math.floor((D0 / F.plank) * 1.6 * (1 - D0 / d));   // 奥ほど板が詰まって見える
    const row = ((v % th) + th) % th, dw = tw * F.plank * k;
    let x = W / 2 - dw / 2; while (x > 0) x -= dw;
    for (; x < W; x += dw) g.drawImage(fim, 0, row, tw, 1, x, y, dw + 1, 1);
  }
  const sg = g.createLinearGradient(0, F.top, 0, F.top + 50);   // 壁ぎわの影
  sg.addColorStop(0, `rgba(40,20,10,${F.wallShadow})`); sg.addColorStop(1, "rgba(40,20,10,0)");
  g.fillStyle = sg; g.fillRect(0, F.top, W, 50);
  // 小物: 奥(yが小さい)から順に置く。床に影を落とす
  [...R.props].sort((a, b) => a.y - b.y).forEach(p => {
    const im = I[p.src], w = p.h * im.naturalWidth / im.naturalHeight;
    if (!p.noShadow) {
      g.fillStyle = "rgba(40,20,10,0.35)";
      g.beginPath(); g.ellipse(p.x, p.y - 2, w * 0.48, Math.max(4, p.h * 0.06), 0, 0, Math.PI * 2); g.fill();
    }
    g.save(); g.translate(p.x, 0); if (p.flip) g.scale(-1, 1);
    g.drawImage(im, -w / 2, p.y - p.h, w, p.h); g.restore();
  });
  // ぼかし・彩度は1回だけ(重い処理なので段階ごとには行わない)
  const room = newCanvas(), rg = room.getContext("2d"), hasFilter = "filter" in rg;
  if (hasFilter) rg.filter = `blur(${R.blur}px) saturate(${R.saturate})`;
  rg.drawImage(raw, 0, 0);
  if (hasFilter) rg.filter = "none";
  // 手前の積み木: 部屋とは別の層にして、自機や敵より手前に描く。左下と右下に、強めにぼかして置く
  let front = null;
  if (R.front) {
    front = newCanvas(); const fg = front.getContext("2d");
    const fr = I[R.front.src], s = R.front.h / fr.naturalHeight, hw = fr.naturalWidth / 2, y0 = H - R.front.h + R.front.sinkY;
    if (hasFilter) fg.filter = `blur(${R.front.blur}px) saturate(${R.saturate})`;
    fg.drawImage(fr, 0, 0, hw, fr.naturalHeight, 0, y0, hw * s, R.front.h);
    fg.drawImage(fr, hw, 0, hw, fr.naturalHeight, W - hw * s, y0, hw * s, R.front.h);
  }
  // 段階ごとの完成画像: 空 → 部屋(段階の明るさと色をかける)
  ROOM.baked = R.tiers.map((T, i) => {
    const c = newCanvas(), cg = c.getContext("2d");
    const sky = cg.createLinearGradient(0, 0, 0, R.wall.height);
    sky.addColorStop(0, T.sky[0]); sky.addColorStop(1, T.sky[1]);
    cg.fillStyle = sky; cg.fillRect(0, 0, W, R.wall.height);
    if (T.stars) {
      let seed = 7 + i;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      cg.fillStyle = "rgba(255,255,230,0.9)";
      for (let n = 0; n < 160; n++) { const r = rnd() < 0.15 ? 1.6 : 0.9; cg.beginPath(); cg.arc(rnd() * W, rnd() * R.wall.height, r, 0, Math.PI * 2); cg.fill(); }
      if (i === R.tiers.length - 1) {   // 夜は右の窓に月を出す
        cg.fillStyle = "#fff6c8"; cg.beginPath(); cg.arc(W - 105, 95, 17, 0, Math.PI * 2); cg.fill();
      }
    }
    cg.fillStyle = "rgba(0,0,0,0.25)"; cg.fillRect(0, 0, W, R.wall.height);   // 空も少しだけ暗く
    cg.drawImage(litLayer(room, T), 0, 0);
    return c;
  });
  ROOM.frontBaked = front ? R.tiers.map(T => litLayer(front, T)) : [];   // 手前の積み木も段階の明るさに合わせる
  ROOM.ready = true;
}
function litLayer(src, T) {   // 絵のある部分だけを、段階の明るさと色にする(窓の外の空や透明な所はそのまま)
  const lit = newCanvas(), lg = lit.getContext("2d");
  lg.drawImage(src, 0, 0);
  lg.globalCompositeOperation = "source-atop";
  lg.fillStyle = `rgba(0,0,0,${1 - T.bright})`; lg.fillRect(0, 0, W, H);
  lg.fillStyle = T.tint; lg.fillRect(0, 0, W, H);
  return lit;
}
function drawFront() {   // 手前の積み木(drawRoom と同じように段階の切り替えでゆっくり変える)
  if (!frontOn || !ROOM.ready || !ROOM.frontBaked.length) return;
  const a = BG_ROOM.front.alpha, F = ROOM.frontBaked;
  if (ROOM.fade < 1 && ROOM.prev >= 0) {
    ctx.globalAlpha = a; ctx.drawImage(F[ROOM.prev], 0, 0);
    ctx.globalAlpha = a * ROOM.fade; ctx.drawImage(F[ROOM.cur], 0, 0);
  } else { ctx.globalAlpha = a; ctx.drawImage(F[ROOM.cur], 0, 0); }
  ctx.globalAlpha = 1;
}

function drawRoom() {   // 段階が変わったら、前の段階の絵からゆっくり切り替える
  const now = performance.now(), dt = Math.min(0.1, (now - (ROOM.last || now)) / 1000); ROOM.last = now;
  const t = Math.min(ROOM.baked.length - 1, state === "title" ? 0 : currentTier());
  if (t !== ROOM.cur) { ROOM.prev = ROOM.cur; ROOM.cur = t; ROOM.fade = ROOM.prev < 0 || t < ROOM.prev ? 1 : 0; }
  ROOM.fade = Math.min(1, ROOM.fade + dt / BG_ROOM.fadeSec);
  if (ROOM.fade < 1) {
    ctx.drawImage(ROOM.baked[ROOM.prev], 0, 0);
    ctx.globalAlpha = ROOM.fade; ctx.drawImage(ROOM.baked[ROOM.cur], 0, 0); ctx.globalAlpha = 1;
  } else ctx.drawImage(ROOM.baked[ROOM.cur], 0, 0);
}

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
function trackMouse(e) {
  lastInput = performance.now();
  const r = cv.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (W / r.width);
  mouse.y = (e.clientY - r.top) * (H / r.height);
}
cv.addEventListener("mousemove", trackMouse);
cv.addEventListener("contextmenu", e => e.preventDefault());
cv.addEventListener("mousedown", e => {
  trackMouse(e);   // 動かさずにクリックしても、押した位置で判定する
  sound.init(); bgm.unlock();
  if (e.button === 2) { if (state === "play") useBomb(); return; }
  onClick();
});
window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  lastInput = performance.now();
  bgm.unlock();
  if (state === "over" || state === "clear") {   // 終了画面
    const R = S.result;
    if (R.naming) {   // 名前の入力中は、ゲームのキー操作を使わない(漢字変換中の Enter は決定にしない)
      if (k === "enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); commitName(nameInput.value); }
      else if (k === "escape") commitName("");
      else if (document.activeElement !== nameInput) nameInput.focus();
      return;
    }
    if (k === "arrowleft" || k === "arrowright" || k === "tab") { e.preventDefault(); R.sel = 1 - R.sel; }
    if (k === "enter") endAction(R.sel);
    if (k === "escape") endAction(1);   // 次の人へ交代
    return;
  }
  if (state === "levelup" && ["1", "2", "3"].includes(k)) chooseUpgrade(+k - 1);
  if (k === "escape" && state === "play" && tut) { finishTutorial(true); return; }        // チュートリアルをスキップ
  if ((k === "p" || k === "escape") && (state === "play" || state === "pause")) state = state === "play" ? "pause" : "play";
  if (k === "m") sound.muted = !sound.muted;
  if (k === "t") autoAim = !autoAim;
  if (k === "d") debug = !debug;
  if (k === "g") PAPER.enabled = !PAPER.enabled;   // 紙風の表示を切り替え
  if (k === "f") frontOn = !frontOn;               // 手前の積み木を切り替え
  if ((k === " " || k === "b") && state === "play") { e.preventDefault(); useBomb(); }
  if (k === "enter" && state === "title") startGame(true);
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
  // 大巨兵の咆哮: 低いうなり(2本のノコギリ波を揺らしながら下げる)と、ざらついた息(ノイズ)を重ねる
  roar(vol = 0.16, dur = 1.8) {
    if (this.muted || !this.ac) return;
    const ac = this.ac, t = ac.currentTime;
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + 0.12);             // 立ち上がり
    out.gain.setValueAtTime(vol, t + dur * 0.45);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);           // 消えていく
    const lp = ac.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(250, t + dur);
    lp.connect(out).connect(ac.destination);
    const lfo = ac.createOscillator(), lfoG = ac.createGain();       // うなりの震え
    lfo.frequency.value = 9; lfoG.gain.value = 6; lfo.connect(lfoG);
    for (const [f0, f1, g0] of [[95, 48, 0.6], [142, 70, 0.35]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      lfoG.connect(o.frequency); g.gain.value = g0;
      o.connect(g).connect(lp); o.start(t); o.stop(t + dur);
    }
    const n = ac.createBufferSource(), buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const ng = ac.createGain(); ng.gain.value = 0.25; n.buffer = buf;
    n.connect(ng).connect(lp); n.start(t); n.stop(t + dur);
    lfo.start(t); lfo.stop(t + dur);
  },
};
// ---- BGM: 状態に合わせて曲を選び、音量をゆっくり変えて切り替える ----
const bgm = {
  tracks: {}, cur: null, unlocked: false,
  init() {
    if (!BGM.enable) return;
    for (const k of ["main", "boss"]) {
      const a = new Audio(BGM[k]); a.loop = true; a.preload = "auto"; a.volume = 0;
      a.onerror = () => console.warn("BGMを読み込めませんでした:", BGM[k]);
      this.tracks[k] = a;
    }
  },
  unlock() {   // ブラウザは操作の中でしか音を出し始められないので、最初の操作で一度鳴らして止めておく
    if (this.unlocked || !BGM.enable) return;
    this.unlocked = true;
    for (const a of Object.values(this.tracks)) a.play().then(() => { if (a !== this.tracks[this.cur]) a.pause(); }).catch(() => { this.unlocked = false; });
  },
  want() {   // 今鳴らすべき曲
    if (state === "title" || state === "over" || state === "clear" || !S) return null;
    if (S.finalSpawned) return S.time >= S.finalAt + BGM.bossDelay ? "boss" : null;   // 咆哮のあと少し間を空けてボス曲
    return S.time >= FINAL.bossAt - BGM.stopBefore ? null : "main";                  // 大巨兵の少し前から静かに
  },
  update(dt) {
    if (!BGM.enable || !this.unlocked) return;
    const w = this.want();
    if (w !== this.cur) {   // 新しい曲は最初から
      if (w) { const a = this.tracks[w]; a.currentTime = 0; a.volume = 0; a.play().catch(() => {}); }
      this.cur = w;
    }
    const base = sound.muted ? 0 : BGM.volume * (state === "pause" || state === "levelup" ? BGM.pauseVolume : 1);
    const step = dt * BGM.volume / BGM.fadeSec;
    for (const [k, a] of Object.entries(this.tracks)) {
      const target = k === this.cur ? base : 0;
      a.volume = Math.max(0, Math.min(1, a.volume + Math.max(-step, Math.min(step, target - a.volume))));
      if (k !== this.cur && a.volume === 0 && !a.paused) a.pause();
    }
  },
};
bgm.init();

// 同じ効果音を短い間隔で何度も鳴らすと重くなるので、間を空ける
const lastSound = {};
function throttled(name, f) { return () => { const now = performance.now(); if (now - (lastSound[name] || 0) < PERF.soundGapMs) return; lastSound[name] = now; f(); }; }
const sfx = {
  shot: () => sound.play(880, 0.05, "square", 0.012, -400),
  hit: throttled("hit", () => sound.play(220, 0.06, "triangle", 0.03, -100)),
  kill: throttled("kill", () => sound.play(160, 0.15, "sawtooth", 0.035, -120)),
  hurt: () => sound.play(90, 0.3, "sawtooth", 0.08, -50),
  gem: throttled("gem", () => sound.play(1200, 0.06, "sine", 0.025, 300)),
  lvl: () => { sound.play(523, 0.12, "square", 0.05); setTimeout(() => sound.play(784, 0.18, "square", 0.05), 110); },
  item: () => sound.play(660, 0.25, "sine", 0.06, 600),
  bomb: () => sound.play(60, 0.6, "sawtooth", 0.12, -20),
  boom: throttled("boom", () => sound.play(100, 0.2, "sawtooth", 0.04, -60)),
  zap: () => sound.play(1500, 0.08, "square", 0.025, -1200),
  nova: () => sound.play(200, 0.35, "sine", 0.07, -150),
  roar: () => sound.roar(),
};

// ============================================================
//  ゲーム状態
// ============================================================
let state = "title";
let autoAim = false, debug = false;
let S, enemies, bullets, ebullets, gems, items, particles, texts, mines, fx, choices, corpses = [];
let spawnTimer, shake, lastTime = performance.now();
let lastInput = performance.now(), prevState = "title";

function startGame(withTutorial) {
  sound.init();
  hideNameInput();
  S = {
    hp: 100, maxHp: 100, time: 0, kills: 0, level: 1, xp: 0, xpNext: LEVEL.base,
    cards: {}, wcool: {}, evolved: {}, bombs: BOMB.start,
    fireCool: 0, shield: 0, invuln: 0, hurtFlash: 0, aimAngle: -Math.PI / 2,
    tierShown: 0, bossDone: {}, finalSpawned: false, finalKilled: false, banner: null,
    score: 0, heat: HEAT.min, maxHeat: HEAT.min, clearBonus: null,
  };
  recalc();
  S.hp = S.maxHp;
  enemies = []; bullets = []; ebullets = []; gems = []; items = []; particles = []; texts = []; mines = []; fx = []; corpses = [];
  spawnTimer = 1; shake = 0;
  state = "play";
  tut = null;
  if (withTutorial) { tut = { step: 0 }; tutGo(0); }
}

function onClick() {
  if (state === "title") { startGame(true); return; }                            // タイトルから: チュートリアル付き
  if (state === "over" || state === "clear") {   // 終了画面: ボタンを押す(名前の入力中なら入力欄に戻す)
    const i = endButtonAt(mouse.x, mouse.y);
    if (i >= 0) endAction(i); else if (S.result.naming) nameInput.focus();
    return;
  }
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
  const hpBoost = type === "titan" ? HEAT.titanHpBoost : HEAT.hpBoost;   // 大巨兵は熱量で硬くなる割合を弱める
  const hp = d.hp * T.hp * (S && !tut ? 1 + (S.heat - HEAT.min) * hpBoost : 1);   // 熱量が高いと少し硬くなる
  const e = { type, d, tier, T, hp, maxHp: hp, r: d.r * (1 + tier * 0.1), speed: d.speed * (0.9 + Math.random() * 0.2),
              color: tier ? mixColor(d.color, T.tint, 0.55) : d.color,
              flash: 0, t: Math.random() * 10, age: 0, cool: 2 + Math.random(), spdMul: 1 };
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
  const art = EART[type];
  if (art && art.ok) {   // 絵のある敵: 見た目と当たり判定を絵に合わせる
    const k = 1 + tier * 0.1, A = ENEMY_ART[type];
    e.art = art; e.artH = A.height * k; e.artW = art.dispW * k; e.r = A.hitR * k;
    if (d.kind === "ground") e.y = GY - e.artH / 2;   // 足の裏を地面に
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
  n = Math.min(n, PERF.maxParticles - particles.length);   // 上限を超えない
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
  if (S.time >= FINAL.clearAt) {
    const hpB = Math.ceil(Math.max(0, S.hp)) * SCORE.hpBonus;
    S.clearBonus = { clear: SCORE.clearBonus, hp: hpB };
    S.score += SCORE.clearBonus + hpB;
    finishRun(true); sfx.lvl(); return;
  }
  if (!tut) updateHeat(dt);
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
    S.finalSpawned = true; S.finalAt = S.time; spawnEnemy("titan", null, TIERS.length - 1); banner("最終決戦 ― 大巨兵 襲来!", "#ff1744"); shake = 10;
    sfx.roar();
    if (FINAL.roar) titanRoar();
  }

  // --- 敵の出現 ---
  S.calm = Math.max(0, (S.calm || 0) - dt);
  if (!tut && S.calm <= 0) spawnTimer -= dt;   // 大巨兵の咆哮のあとは、しばらく敵が出てこない
  if (spawnTimer <= 0 && S.calm <= 0) {
    const interval = spawnInterval();
    spawnTimer = interval * (0.7 + Math.random() * 0.6);
    const n = 1 + Math.floor(S.time / SPAWN.batchEvery);
    for (let i = 0; i < n && enemies.length < PERF.maxEnemies; i++) spawnEnemy(pickEnemyType());
  }

  // --- エイム ---
  let target = { x: mouse.x, y: mouse.y };
  if (autoAim) { const n = nearestEnemy(P); if (n) target = n; }
  let ang = Math.atan2(target.y - AIM.y, target.x - AIM.x);
  const down = PLAYER_ART.maxDownAngle * Math.PI / 180;   // 水平より下に向けられる限界
  if (ang > down && ang < Math.PI - down) ang = ang < Math.PI / 2 ? down : Math.PI - down;
  S.aimAngle = ang;

  // --- 主砲の自動連射 ---
  S.fireCool -= dt;
  if (S.fireCool <= 0) {
    S.fireCool = S.fireInt;
    for (let i = 0; i < S.multi; i++) {
      const a = ang + (i - (S.multi - 1) / 2) * 0.12;
      fireBullet(AIM.x + Math.cos(a) * MUZZLE, AIM.y + Math.sin(a) * MUZZLE, a,
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
    if (Math.hypot(P.x - eb.x, P.y - eb.y) < eb.r + PR - 2) { eb.life = 0; hurtPlayer(eb.dmg); }
  }
  ebullets = ebullets.filter(b => b.life > 0);

  // --- 地雷 ---
  for (const m of mines) {
    m.armed -= dt;
    if (m.armed > 0) continue;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const onGround = e.d.kind === "ground" && Math.abs(e.x - m.x) < e.r + 8;
      const above = m.leap && e.y > GY - EVOLVE.leapMine.airReach && Math.abs(e.x - m.x) < e.r + 24;   // 跳躍地雷は真上の敵にも反応
      if (onGround || above) {
        m.dead = true; explode(m.x, GY - 12, m.radius, m.dmg, null, "#ffab40");
        if (m.leap) explode(m.x, GY - EVOLVE.leapMine.airHeight, m.radius, m.dmg, null, "#ffd180");   // 跳び上がって空中でもう一度
        sfx.boom(); break;
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
  for (const it of items) { it.t += dt; if (it.lock > 0) it.lock -= dt; it.y += Math.sin(it.t * 2) * 10 * dt; it.x += it.vx * dt; if (it.t > 7 && !it.tut) it.dead = true; }   // チュートリアルのアイテムは消えない
  items = items.filter(i => !i.dead);

  // --- 演出 ---
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; }
  for (const c of corpses) c.t += dt;
  corpses = corpses.filter(c => c.t < PAPER.fallTime * (c.e.d.kind === "ground" ? 1 : 1.6));
  particles = particles.filter(p => p.life > 0);
  for (const t of texts) { t.y -= 30 * dt; t.life -= dt; }
  texts = texts.filter(t => t.life > 0);
  for (const f of fx) f.life -= dt;
  fx = fx.filter(f => f.life > 0);

  if (S.hp <= 0) { S.hp = 0; finishRun(false); sfx.bomb(); }
}

// ---- 武装 ----
// 地上砲台: 左右に1基ずつ。groundPos は砲口の位置(弾が出る場所)
function groundScale() { return S && S.evolved && S.evolved.ground ? TURRET_ART.evolvedScale : 1; }
function groundUnit(side) {
  const G = TURRET_ART.ground, k = groundScale(), w = G.width * k, h = G.height * k, cx = P.x + side * (G.offset + w / 2);
  return { cx, w, h, muzzle: { x: cx + side * w / 2, y: GY - h + h * G.muzzleY } };
}
function groundPos(side) { return groundUnit(side).muzzle; }
// 対空砲台: 通常は1基、高射砲陣地で3基。左側に置くものは左右反転する
function flakUnit(i) {
  const F = TURRET_ART.flak, off = F.positions[i] ?? F.positions[0], k = S && S.evolved && S.evolved.flak ? TURRET_ART.evolvedScale : 1;
  const w = F.width * k, h = F.height * k, flip = off < 0, cx = P.x + off, mx = flip ? 1 - F.muzzleX : F.muzzleX;
  return { cx, w, h, flip, muzzle: { x: cx - w / 2 + w * mx, y: GY - h + h * F.muzzleY } };
}
const FLAK_POS = { get x() { return flakUnit(0).muzzle.x; }, get y() { return flakUnit(0).muzzle.y; } };   // 1基目の砲口

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
      const leap = S.evolved.mine, E = EVOLVE.leapMine;
      if (mines.length < Wp.max(L) + (leap ? E.extraMax : 0)) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = Math.max(20, Math.min(W - 20, P.x + side * (90 + Math.random() * 330)));
        mines.push({ x, armed: 0.4, dmg: Wp.dmg(L) * S.dmgMul, radius: Wp.radius(L) * (leap ? E.radiusMul : 1), leap: !!leap });
        fired = true;
      }
    } else if (id === "missile") {
      const t = strongestEnemy();
      if (t) {
        const n = Wp.count(L);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.5 + (Math.random() - 0.5) * 0.2;
          fireBullet(AIM.x, AIM.y, a, { kind: "missile", speed: 300, dmg: Wp.dmg(L) * S.dmgMul, r: S.evolved.missile ? 7 : 5, color: S.evolved.missile ? "#ff3d00" : "#ff8a65", life: 4, extra: { target: t, cluster: !!S.evolved.missile } });
        }
        fired = true;
      }
    } else if (id === "thunder") {
      // 雷嵐(進化): 別々の敵を最初の目標にして、雷を複数本落とす
      const E = EVOLVE.storm, storm = S.evolved.thunder;
      const hit = new Set();
      for (let b = 0; b < (storm ? E.bolts : 1); b++) {
        let cur = nearestEnemy(P, e => !hit.has(e), storm ? E.reach : 400);
        if (!cur) break;
        const pts = [{ x: AIM.x, y: AIM.y }];
        for (let i = 0; i < Wp.chain(L) && cur; i++) {
          hit.add(cur); pts.push({ x: cur.x, y: cur.y });
          damageEnemy(cur, Wp.dmg(L) * S.dmgMul);
          const from = cur;
          cur = nearestEnemy(from, e => !hit.has(e), storm ? E.jump : 170);
        }
        fx.push({ type: "bolt", pts, life: 0.15, color: storm ? "#b388ff" : null });
        fired = true;
      }
      if (fired) sfx.zap();
    } else if (id === "nova") {
      if (nearestEnemy(P, null, novaRadius())) { novaBlast(1, 1); fired = true; }
    }
    S.wcool[id] = fired ? Wp.interval(L) * (id === "ground" && S.evolved.ground ? EVOLVE.heavy.intervalMul : 1) : 0.15;
  }
}

// 減速の効き目(0〜1): 熱量が高いほど、大きい敵ほど効きにくい
function slowEffect(e) {
  const heat = tut ? 1 : Math.max(0, 1 - (S.heat - HEAT.min) * SLOW_RESIST.perHeat);
  const size = e.d.boss ? SLOW_RESIST.boss : e.type === "brute" ? SLOW_RESIST.brute : 1;
  return heat * size;
}
function slowRadius() { const L = lv("slow"); return L ? WEAPON.slow.radius(L) * (S.evolved.slow ? EVOLVE.gravity.radiusMul : 1) : 0; }

// 衝撃波: 周りの敵にダメージを与えて吹き飛ばし、敵弾を消す(反撃衝撃波では範囲が広く、被弾時にも強いものが出る)
function novaRadius() { return WEAPON.nova.radius(lv("nova")) * (S.evolved.nova ? EVOLVE.counter.radiusMul : 1); }
function novaBlast(dmgMul, knockMul) {
  const L = lv("nova"), Wp = WEAPON.nova, R = novaRadius();
  for (const e of enemies) if (e.hp > 0 && dist(e, P) < R + e.r) { damageEnemy(e, Wp.dmg(L) * S.dmgMul * dmgMul); knockback(e, P.x, P.y, Wp.knock(L) * knockMul); }
  for (const eb of ebullets) if (dist(eb, P) < R) eb.life = 0;
  fx.push({ type: "ring", r: R, life: 0.35, max: 0.35, color: dmgMul > 1 ? "255,215,64" : null });
  sfx.nova(); shake = Math.max(shake, dmgMul > 1 ? 6 : 3);
}

function clusterBurst(b) {
  const E = EVOLVE.cluster;
  for (let i = 0; i < E.bomblets; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
    fireBullet(b.x, b.y, a, { kind: "bomblet", speed: 120 + Math.random() * 140, dmg: b.dmg * E.bombletDmg, r: 3, color: "#ffab40",
      life: 0.45 + Math.random() * 0.4, extra: { radius: E.bombletRadius } });
  }
}
function flakBarrel(i) { return flakUnit(i).muzzle; }

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
      for (const it of items) if (!it.dead && !(it.lock > 0) && Math.hypot(it.x - b.x, it.y - b.y) < 16 + b.r) collectItem(it);  // アイテムは主砲で撃って取る
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
  const slowL = lv("slow"), G = EVOLVE.gravity, grav = slowL && S.evolved.slow;
  const slowR = slowRadius(), slowF = grav ? G.slow : slowL ? WEAPON.slow.factor(slowL) : 0;
  let gravHit = false;   // 重力場: 一定間隔で、中の敵にまとめてダメージ
  if (grav && (S.gravCool = (S.gravCool ?? G.tick) - dt) <= 0) { S.gravCool += G.tick; gravHit = true; }
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    e.t += dt; e.age += dt; e.flash = Math.max(0, e.flash - dt);
    const inField = slowL && dist(e, P) < slowR + e.r;
    e.spdMul = inField ? 1 - slowF * slowEffect(e) : 1;
    if (inField && gravHit) { damageEnemy(e, G.dps * G.tick * S.dmgMul); if (e.hp <= 0) continue; }
    const sp = e.speed * e.spdMul;
    const k = e.d.kind;
    if (k === "ground") {
      e.x += Math.sign(P.x - e.x) * sp * dt;
      if (Math.abs(P.x - e.x) < e.r + PR + 8) hitPlayer(e);
    } else if (k === "side") {
      e.x += Math.sign(P.x - e.x) * sp * dt;
      if (Math.abs(P.x - e.x) < 220) e.baseY += (P.y - e.baseY) * dt * 1.5 * e.spdMul;   // 近くなったら降下
      e.y = e.baseY + Math.sin(e.t * 4) * 30;
      if (Math.hypot(P.x - e.x, P.y - e.y) < e.r + PR) hitPlayer(e);
    } else if (k === "air") {
      const a = Math.atan2(P.y - e.y, P.x - e.x);
      e.x += (Math.cos(a) * sp + Math.cos(e.t * 2.5) * 60 * e.spdMul) * dt;
      e.y += Math.sin(a) * sp * dt;
      if (Math.hypot(P.x - e.x, P.y - e.y) < e.r + PR) hitPlayer(e);
    } else if (k === "hover") {
      if (e.y < e.hoverY) e.y += sp * dt;
      e.x += Math.sin(e.t * 0.8) * 40 * dt;
      e.cool -= dt;
      if (e.cool <= 0 && e.y >= e.hoverY - 1) {
        e.cool = 3.2;
        const my = e.y + (e.art ? e.artH * 0.42 : 0);   // 絵のある砲撃手は下の砲口から撃つ
        const a = Math.atan2(P.y - my, P.x - e.x);
        ebullets.push({ x: e.x, y: my, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, r: 7, life: 8, dmg: Math.round(10 * e.T.dmg) });
      }
    }
  }
  enemies = enemies.filter(e => e.hp > 0);
}

// 熱量: 時間で少しずつ下がり、囲まれているとさらに下がる
function updateHeat(dt) {
  let near = 0;
  for (const e of enemies) if (e.hp > 0 && dist(e, P) < HEAT.crowdRadius) near++;
  let drop = HEAT.decayPerSec;
  if (near >= HEAT.crowdCount) drop += HEAT.crowdDropPerSec;
  S.heat = Math.max(HEAT.min, S.heat - drop * dt);
}
function heatSpawnMul() { return 1 + (S.heat - HEAT.min) * HEAT.spawnBoost; }
function spawnInterval() { return Math.max(SPAWN.minInterval, SPAWN.startInterval - S.time * SPAWN.rampPerSec) / heatSpawnMul(); }
function spawnPerSec() { return (1 + Math.floor(S.time / SPAWN.batchEvery)) / spawnInterval(); }   // 今の出現ペース(体/秒の目安)
function heatPerKill() { return HEAT.gainPerSec / spawnPerSec(); }   // 敵が多いほど1体あたりは少なく(終盤でも上がる速さを一定に)

// 大巨兵の咆哮: 地上の敵を吹き飛ばして全身を見せる(プレイヤーが倒したわけではないので、点数・経験値・熱量は入らない)
function titanRoar() {
  for (const e of enemies) {
    if (e.hp <= 0 || e.d.boss || e.d.kind !== "ground") continue;
    e.hp = 0; e.flash = 0; burst(e.x, e.y, e.color, 10);
    if (PAPER.enabled && corpses.length < PERF.maxCorpses) corpses.push({ e, t: 0, dir: e.x < P.x ? -1 : 1 });
  }
  S.calm = FINAL.calmSec;
  fx.push({ type: "flash", life: 0.2, max: 0.2 });
  shake = 16;
}
// 大巨兵の絵に重なっているか(重なった敵は半透明で描く)
function overTitan(e, t) {
  return Math.abs(e.x - t.x) < t.artW * 0.45 + e.r && Math.abs(e.y - t.y) < t.artH * 0.5 + e.r;
}

function damageEnemy(e, dmg) {
  if (e.hp <= 0) return;
  e.hp -= dmg; e.flash = 0.08;
  sfx.hit();
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  S.kills++;
  if (!tut || tut.heatOn) {   // スコア(熱量が倍率)と熱量の上昇(チュートリアルでは熱量の手順だけ)
    let pts = e.d.xp * e.T.score * SCORE.perXp;
    if (e.type === "boss") pts += SCORE.bossBonus; else if (e.type === "titan") pts += SCORE.titanBonus;
    pts = Math.round(pts * S.heat / 10) * 10;
    S.score += pts;
    if (e.d.boss) floatText(e.x, e.y - e.r - 20, `+${pts.toLocaleString()}`, "#f0e442");
    if (!bombing) S.heat = Math.min(HEAT.max, S.heat + (tut ? TUT_HEAT_GAIN : heatPerKill() * (e.age <= HEAT.fastKillTime ? HEAT.fastBonus : 1)));   // ボムで倒した分は上げない
    S.maxHeat = Math.max(S.maxHeat, S.heat);
  }
  if (e.type === "titan") { S.finalKilled = true; banner("大巨兵 撃破!", "#ffd54f"); }
  sfx.kill();
  burst(e.x, e.y, e.color, e.d.boss ? 40 : 12);
  if (PAPER.enabled && corpses.length < PERF.maxCorpses) { e.flash = 0; corpses.push({ e, t: 0, dir: e.x < P.x ? -1 : 1 }); }   // 紙風: 倒れる動き
  const n = e.d.boss ? 10 : 1;
  for (let i = 0; i < n; i++)
    gems.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 160, vy: -120 - Math.random() * 120, t: 0, v: e.d.xp * e.T.xp / n / (tut ? 1 : heatSpawnMul()) });   // 熱量で増えた敵の分は経験値にしない
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
  if (!tut) S.heat = Math.max(HEAT.min, S.heat - HEAT.hurtDrop);   // 被弾で熱量が下がる
  if (S.evolved.nova) novaBlast(EVOLVE.counter.counterDmgMul, EVOLVE.counter.counterKnockMul);   // 反撃衝撃波
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
  bombing = true;
  for (const e of enemies) damageEnemy(e, dmg);
  bombing = false;
  if (!tut) S.heat = Math.max(HEAT.min, S.heat - HEAT.bombDrop);
  ebullets = [];
}
let bombing = false;   // ボムで倒している最中か

function collectItem(it) {
  it.dead = true; sfx.item();
  const I = ITEMS[it.type];
  burst(it.x, it.y, I.color, 16);
  const bombFull = it.type === "bomb" && S.bombs >= BOMB.max;
  if (!bombFull) floatText(it.x, it.y - 20, I.desc, I.color);
  if (it.type === "heart") S.hp = Math.min(S.maxHp, S.hp + 25);
  if (it.type === "shield") S.shield = SHIELD.duration;
  if (it.type === "bomb") {
    if (!bombFull) S.bombs++;
    else {   // 上限まで持っているときは発動せず、スコアのボーナスに変わる
      const pts = Math.round(BOMB.fullBonus * (tut ? 1 : S.heat) / 10) * 10;
      if (!tut) S.score += pts;
      floatText(it.x, it.y - 20, `ボム満タン +${pts.toLocaleString()}`, I.color);
    }
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
  // ビルドが完成して取れるカードが無いときは、選択画面を出さずにボーナスを受け取る
  if (!pick.length && !tut) {
    const pts = Math.round(LEVEL_BONUS.score * S.heat / 10) * 10;
    S.score += pts; S.hp = Math.min(S.maxHp, S.hp + LEVEL_BONUS.heal);
    floatText(P.x, P.y - 60, `LEVEL UP  +${pts.toLocaleString()}`, "#69f0ae"); sfx.gem();
    return;
  }
  const fillers = [CARD.heal];   // 足りない枠は回復だけで埋める(ボム補充は出さない)
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
    text: () => tut.qt < TUT_ITEM_LOCK
      ? `♥ = HP回復 ・ S = ${SHIELD.duration}秒間 無敵のシールド ・ B = ボム+1(4個まで)`
      : "浮かんでいるアイテムは、撃つと手に入ります。3つとも取ってみよう",
    start() {
      S.hp = Math.min(S.hp, Math.round(S.maxHp * 0.6));   // ♥の効果が分かるようにHPを減らしておく
      S.bombs = Math.min(S.bombs, BOMB.max - 1);           // Bを取ったときにストックが増えるのが見えるように
      for (const [type, x, y, caption] of [["heart", P.x - 270, 290, "HPを回復"], ["shield", P.x + 130, 320, ""], ["bomb", P.x + 300, 235, "ボムのストック+1"]])
        items.push({ type, x, y, vx: 0, t: 0, tut: true, lock: TUT_ITEM_LOCK, caption: type === "shield" ? `${SHIELD.duration}秒間 無敵のシールド` : caption });
    },
    done: () => !items.some(i => i.tut) },
  { title: "ボムで切り抜ける",
    text: "囲まれたら 右クリック(または Space)でボム! 画面中の敵に大ダメージ",
    start() { S.bombs = Math.max(S.bombs, 1); tutCrowd(); },
    update() { if (!tut.bombUsed && enemies.length === 0) { S.bombs = Math.max(S.bombs, 1); tutCrowd(); } },
    done: () => tut.bombUsed },
  { title: "熱量とスコア",
    text: () => S.heat < TUT_HEAT_GOAL
      ? "敵を素早く倒すと、画面上の「熱量」が上がる。熱量が上がるまで倒そう"
      : "熱量が高いほど敵は増えて硬くなるが、スコアも倍増。被弾すると下がる",
    start() {
      S.heat = HEAT.min; tut.heatOn = true;
      tut.queue = [["grunt", "L", 0.3], ["grunt", "R", 0.8], ["runner", "L", 1.4], ["grunt", "R", 1.9], ["diver", null, 2.4], ["grunt", "L", 3.0], ["runner", "R", 3.5], ["grunt", "L", 4.0]];
    },
    update(dt) {
      if (S.heat >= TUT_HEAT_GOAL) tut.heatShown += dt;   // 目標に届いたら、説明を読む時間をとる
      else if (!tut.queue.length && enemies.length < 2) { tut.qt = 0; tut.queue = [["grunt", "L", 0.2], ["grunt", "R", 0.6], ["runner", "L", 1.0], ["diver", null, 1.4]]; }   // 届くまで敵を出し続ける
    },
    done: () => tut.heatShown > 4 },
];
const TUT_ITEM_LOCK = 2.5;   // チュートリアルのアイテムが取れるようになるまでの秒数(説明を読む時間)
const TUT_HEAT_GOAL = 1.6;   // チュートリアルで熱量をここまで上げたら次へ
const TUT_HEAT_GAIN = 0.1;   // チュートリアルでは1体ごとに熱量をこれだけ上げる(本番より速く)
let tut = null;   // チュートリアルの進行状況(本編中は null)

function tutCrowd() {
  for (let i = 0; i < 5; i++) for (const side of [-1, 1]) { const e = spawnEnemy("grunt", side < 0 ? "L" : "R", 0); e.x = P.x + side * (230 + i * 40); }
}

function tutGo(step) {
  if (step >= TUTORIAL.length) return finishTutorial(false);
  Object.assign(tut, { step, wait: 0, chosen: false, bombUsed: false, queue: [], qt: 0, doneTimer: 0, heatOn: false, heatShown: 0 });
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
  wrapText(st.done() ? "OK!" : (typeof st.text === "function" ? st.text() : st.text), W / 2, y + 48, w - 30, 20);
  ctx.textAlign = "left";
}

// ============================================================
//  描画
// ============================================================
function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  if (ROOM.ready) {   // 子ども部屋のジオラマ
    ctx.fillStyle = "#000"; ctx.fillRect(-20, -20, W + 40, H + 40);
    drawRoom();
    const fg = ctx.createLinearGradient(0, GY, 0, H);   // 自機のまわり(地面より下)を少し暗くして見やすく
    fg.addColorStop(0, "rgba(0,0,0,0.15)"); fg.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = fg; ctx.fillRect(-20, GY, W + 40, H - GY + 20);
    ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.fillRect(-20, GY, W + 40, 2);
  } else {           // 前の背景(画像が読み込めないとき・BG_ROOM.enable が false のとき)
    const grd = ctx.createLinearGradient(0, 0, 0, GY);
    grd.addColorStop(0, "#0f1424"); grd.addColorStop(1, "#1c2340");
    ctx.fillStyle = grd; ctx.fillRect(-20, -20, W + 40, GY + 20);
    if (BG.middle.ok) ctx.drawImage(BG.middle.baked, 0, 0);   // 背景の中層(本棚やおもちゃ)
    ctx.fillStyle = "#2a2f45"; ctx.fillRect(-20, GY, W + 40, H - GY + 20);
    ctx.fillStyle = "#3a4060"; ctx.fillRect(-20, GY, W + 40, 3);
  }
  ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.font = "bold 64px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("◀", 50, GY - 40); ctx.fillText("▶", W - 50, GY - 40); ctx.fillText("▼", W / 2, 70);

  if (state !== "title") drawWorld();
  drawFront();   // 手前の積み木は自機や敵より手前
  ctx.restore();

  if (state === "title") drawTitle();
  if (state !== "title" && state !== "over" && state !== "clear") drawHUD();   // 終了画面では結果だけを見せる
  if (state === "levelup") drawLevelUp();
  if (state === "pause") drawCenter("PAUSE", "P / Esc で再開");
  if (state === "over" || state === "clear") drawResult();
  drawCrosshair();
}

function idleNote() {   // 放置されているとき、タイトルへ戻るまでの残り秒数
  const left = EVENT.idleToTitle - (performance.now() - lastInput) / 1000;
  return left < 10 ? `\n${Math.ceil(Math.max(0, left))}秒後にタイトルへ戻ります` : "";
}

// ============================================================
//  終了画面(結果・ビルド・ランキング・ボタン)
// ============================================================
const RANK_KEY = `tridentwave_ranking_v1_${MODE}`;   // 10分モードと5分モードで別々に記録
function loadRanking() {
  try { const a = JSON.parse(localStorage.getItem(RANK_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function saveRanking(list) { try { localStorage.setItem(RANK_KEY, JSON.stringify(list)); } catch (e) {} }

function buildList() {   // 持っているカード(武装→強化の順)
  return ["weapon", "passive"].flatMap(type => ownedOf(type).map(c => ({ id: c.id, type, name: c.name, lv: lv(c.id), evo: S.evolved[c.id] ? EVO_OF[c.id].name : null })));
}

// ゲームが終わったとき: 結果をまとめ、ランキングに入るなら名前を聞く
function finishRun(cleared) {
  state = cleared ? "clear" : "over";
  const entry = { name: "", score: S.score, time: Math.min(S.time, FINAL.clearAt), clear: cleared, titan: S.finalKilled,
                  heat: S.maxHeat, lv: S.level, kills: S.kills, build: buildList(), date: Date.now() };
  const list = loadRanking();
  const rank = list.filter(r => r.score >= entry.score).length;   // 同点は先に登録した人が上
  const ranked = entry.score > 0 && rank < RANKING.size;
  S.result = { entry, list, rank: ranked ? rank : -1, naming: ranked, sel: 0, saved: false };
  if (ranked) showNameInput();
}
function commitName(name) {
  const R = S.result; if (!R || !R.naming) return;
  R.entry.name = (name || "").trim().slice(0, RANKING.nameMax) || RANKING.defaultName;
  R.list.splice(R.rank, 0, R.entry); R.list = R.list.slice(0, RANKING.size);
  saveRanking(R.list); R.naming = false; R.saved = true;
  hideNameInput(); sfx.item();
}
function endAction(i) {   // 0 = もう一度(チュートリアルなし) / 1 = タイトルへ(次の人へ交代。チュートリアルから)
  if (S.result && S.result.naming) commitName(nameInput.value);   // 入力途中でも、そこまでの名前で登録する
  hideNameInput();
  if (i === 0) startGame(false); else state = "title";
}

// 名前の入力欄(日本語入力ができるよう、画面の上にHTMLの入力欄を重ねる)
const nameInput = document.createElement("input");
Object.assign(nameInput, { type: "text", maxLength: RANKING.nameMax, placeholder: RANKING.defaultName, autocomplete: "off" });
Object.assign(nameInput.style, { position: "fixed", display: "none", zIndex: 10, boxSizing: "border-box", padding: "0 6px",
  border: "2px solid #ffd740", borderRadius: "4px", background: "#fff8e1", color: "#1a1a1a", fontWeight: "bold", outline: "none" });
document.body.appendChild(nameInput);
function showNameInput() { nameInput.value = ""; nameInput.style.display = "block"; setTimeout(() => nameInput.focus(), 0); }
function hideNameInput() { nameInput.style.display = "none"; nameInput.blur(); }
function placeNameInput(x, y, w, h) {   // ゲーム画面の座標 → ページ上の位置
  const r = cv.getBoundingClientRect(), k = r.width / W;
  Object.assign(nameInput.style, { left: `${r.left + x * k}px`, top: `${r.top + y * k}px`, width: `${w * k}px`, height: `${h * k}px`, fontSize: `${14 * k}px` });
}

const END_BTN = [
  { label: "もう一度", sub: "チュートリアルなしで すぐ始める" },
  { label: "タイトルへ", sub: "次の人へ交代(チュートリアルから)" },
];
function endButtonRect(i) { const w = 300, h = 52, gap = 28, x0 = (W - (w * 2 + gap)) / 2; return { x: x0 + i * (w + gap), y: 462, w, h }; }
function endButtonAt(x, y) { for (let i = 0; i < 2; i++) { const b = endButtonRect(i); if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return i; } return -1; }

function fitFont(text, maxW, size, weight = "bold") {   // 枠に収まるまで文字を小さくする
  do { ctx.font = `${weight} ${size}px sans-serif`; } while (ctx.measureText(text).width > maxW && --size > 8);
}
function panel(x, y, w, h, title) {
  ctx.fillStyle = "rgba(20,26,50,0.92)"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#3a4570"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#90caf9"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "left"; ctx.fillText(title, x + 14, y + 22);
}

function drawResult() {
  const R = S.result, E = R.entry, cleared = state === "clear";
  const hov = endButtonAt(mouse.x, mouse.y); if (hov >= 0) R.sel = hov;
  ctx.fillStyle = "rgba(5,8,16,0.85)"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.font = "bold 38px sans-serif"; ctx.fillStyle = cleared ? "#ffd740" : "#ff8a80";
  ctx.fillText(cleared ? "CLEAR!" : "GAME OVER", W / 2, 50);

  // ---- 左: 今回の結果とビルド ----
  const lx = 24, ly = 70, lw = 452;
  panel(lx, ly, lw, 376, `今回の結果  (${MODES[MODE].label})`);
  ctx.textAlign = "left"; ctx.fillStyle = "#b0bec5"; ctx.font = "13px sans-serif"; ctx.fillText("スコア", lx + 16, ly + 52);
  ctx.fillStyle = "#fff"; ctx.font = "bold 34px sans-serif"; ctx.fillText(E.score.toLocaleString(), lx + 66, ly + 56);
  ctx.textAlign = "right"; ctx.font = "bold 16px sans-serif";
  if (R.rank >= 0) { ctx.fillStyle = "#ffd740"; ctx.fillText(`ランキング ${R.rank + 1}位!`, lx + lw - 16, ly + 52); }
  else { ctx.fillStyle = "#78909c"; ctx.fillText("ランキング外", lx + lw - 16, ly + 52); }
  ctx.textAlign = "left"; ctx.font = "12px sans-serif"; ctx.fillStyle = "#b0bec5";
  if (cleared && S.clearBonus) ctx.fillText(`(クリアボーナス +${S.clearBonus.clear.toLocaleString()} ・ 残りHP +${S.clearBonus.hp.toLocaleString()} を含む)`, lx + 16, ly + 76);
  const stats = [
    ["生存", cleared ? `${clearMinutes()}分間 生き残った!` : `${fmtTime(E.time)} / ${fmtTime(FINAL.clearAt)}`],
    ["最高熱量", `×${E.heat.toFixed(1)}`],
    ["レベル", `Lv ${E.lv}`],
    ["撃破", `${E.kills.toLocaleString()} 体`],
    ["大巨兵", E.titan ? "撃破!" : S.finalSpawned ? "撃破ならず" : "未到達"],
  ];
  stats.forEach(([k, v], i) => {
    const x = lx + 16 + (i % 2) * 216, y = ly + 104 + Math.floor(i / 2) * 24;
    ctx.fillStyle = "#78909c"; ctx.font = "13px sans-serif"; ctx.fillText(k, x, y);
    ctx.fillStyle = k === "大巨兵" && E.titan ? "#ffd740" : "#eceff1"; ctx.font = "bold 14px sans-serif"; ctx.fillText(v, x + 66, y);
  });
  drawBuildCards(lx + 16, ly + 182, lw - 32, E.build);

  // ---- 右: ランキング ----
  const rx = 496, ry = 70, rw = 440;
  panel(rx, ry, rw, 376, `ランキング  ${MODES[MODE].label}`);
  const rows = R.naming ? [...R.list.slice(0, R.rank), E, ...R.list.slice(R.rank)].slice(0, RANKING.size) : R.list;
  const cols = { rank: rx + 34, name: rx + 52, score: rx + 296, res: rx + 362, heat: rx + rw - 14 };
  ctx.font = "11px sans-serif"; ctx.fillStyle = "#78909c";
  ctx.textAlign = "right"; ctx.fillText("順位", cols.rank, ry + 46); ctx.fillText("スコア", cols.score, ry + 46); ctx.fillText("最高熱量", cols.heat, ry + 46);
  ctx.textAlign = "left"; ctx.fillText("名前", cols.name, ry + 46); ctx.textAlign = "center"; ctx.fillText("結果", cols.res, ry + 46);
  const rowH = 29;
  for (let i = 0; i < RANKING.size; i++) {
    const y = ry + 58 + i * rowH, r = rows[i], me = r === E;
    if (me) { ctx.fillStyle = "rgba(255,215,64,0.18)"; ctx.fillRect(rx + 6, y, rw - 12, rowH - 3); }
    else if (i % 2) { ctx.fillStyle = "rgba(255,255,255,0.03)"; ctx.fillRect(rx + 6, y, rw - 12, rowH - 3); }
    const ty = y + 19;
    ctx.textAlign = "right"; ctx.font = "bold 15px sans-serif"; ctx.fillStyle = i === 0 ? "#ffd740" : i === 1 ? "#cfd8dc" : i === 2 ? "#ffab91" : "#90a4ae";
    ctx.fillText(`${i + 1}`, cols.rank, ty);
    if (!r) { ctx.textAlign = "left"; ctx.fillStyle = "#455a64"; ctx.font = "13px sans-serif"; ctx.fillText("---", cols.name, ty); continue; }
    if (me && R.naming) placeNameInput(cols.name - 4, y + 2, 170, rowH - 7);   // この行に名前の入力欄を重ねる
    else { ctx.textAlign = "left"; ctx.fillStyle = me ? "#ffd740" : "#eceff1"; fitFont(r.name, 160, 14, me ? "bold" : "normal"); ctx.fillText(r.name, cols.name, ty); }
    ctx.textAlign = "right"; ctx.font = "bold 14px sans-serif"; ctx.fillStyle = me ? "#ffd740" : "#fff"; ctx.fillText(r.score.toLocaleString(), cols.score, ty);
    ctx.textAlign = "center"; ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = r.clear ? (r.titan ? "#ffd740" : "#69f0ae") : "#90a4ae";
    ctx.fillText(r.clear ? (r.titan ? "★CLEAR" : "CLEAR") : fmtTime(r.time), cols.res, ty);
    ctx.textAlign = "right"; ctx.font = "13px sans-serif"; ctx.fillStyle = "#ffcc80"; ctx.fillText(`×${r.heat.toFixed(1)}`, cols.heat, ty);
  }
  ctx.textAlign = "center"; ctx.font = "bold 13px sans-serif";
  if (R.naming) { ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? "#ffd740" : "#fff59d"; ctx.fillText("ランキング入り! 名前を入力して Enter(空欄なら「" + RANKING.defaultName + "」)", rx + rw / 2, ry + 366); }
  else if (R.saved) { ctx.fillStyle = "#69f0ae"; ctx.fillText("ランキングに登録しました", rx + rw / 2, ry + 366); }
  else { ctx.fillStyle = "#78909c"; ctx.font = "12px sans-serif"; ctx.fillText("★CLEAR = 大巨兵も倒してクリア", rx + rw / 2, ry + 366); }

  // ---- 下: ボタン ----
  END_BTN.forEach((btn, i) => {
    const b = endButtonRect(i), on = R.sel === i && !R.naming;
    ctx.fillStyle = on ? "#2b3a6e" : "#1a2140"; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = on ? "#ffd740" : "#3a4570"; ctx.lineWidth = on ? 3 : 2; ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.textAlign = "center"; ctx.fillStyle = on ? "#fff" : "#b0bec5"; ctx.font = "bold 19px sans-serif"; ctx.fillText(btn.label, b.x + b.w / 2, b.y + 24);
    ctx.font = "12px sans-serif"; ctx.fillStyle = on ? "#ffe082" : "#78909c"; ctx.fillText(btn.sub, b.x + b.w / 2, b.y + 42);
  });
  ctx.textAlign = "center"; ctx.font = "12px sans-serif"; ctx.fillStyle = "#78909c";
  const note = idleNote().trim();
  ctx.fillText(R.naming ? "名前を決めると、ボタンを選べます(ボタンをクリックしても登録されます)" : `←→ で選んで Enter / クリック    Esc: タイトルへ${note ? "    " + note : ""}`, W / 2, H - 10);
}

// ビルド: 武装4枠・強化4枠をカードで並べる。進化したものは金色
function drawBuildCards(x, y, w, build) {
  const cw = (w - 3 * 8) / 4, ch = 70;
  ["weapon", "passive"].forEach((type, row) => {
    const owned = build.filter(c => c.type === type), slots = type === "weapon" ? CARD_RULES.weaponSlots : CARD_RULES.passiveSlots;
    const ry = y + row * (ch + 26);
    ctx.textAlign = "left"; ctx.font = "bold 12px sans-serif"; ctx.fillStyle = TYPE_COLOR[type];
    ctx.fillText(`${TYPE_LABEL[type]} ${owned.length}/${slots}`, x, ry - 6);
    for (let i = 0; i < slots; i++) {
      const cx = x + i * (cw + 8), c = owned[i];
      if (!c) {   // 空き枠
        ctx.strokeStyle = "#37474f"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(cx, ry, cw, ch); ctx.setLineDash([]);
        ctx.textAlign = "center"; ctx.fillStyle = "#455a64"; ctx.font = "12px sans-serif"; ctx.fillText("空き", cx + cw / 2, ry + ch / 2 + 4);
        continue;
      }
      const evo = !!c.evo, col = evo ? "#ffd740" : TYPE_COLOR[type];
      ctx.fillStyle = evo ? "#3a3110" : "#1a2140"; ctx.fillRect(cx, ry, cw, ch);
      ctx.strokeStyle = evo ? "#ffd740" : "#3a4570"; ctx.lineWidth = evo ? 2.5 : 1.5; ctx.strokeRect(cx, ry, cw, ch);
      ctx.fillStyle = col; ctx.fillRect(cx, ry, cw, 3);
      ctx.textAlign = "center";
      if (evo) {
        ctx.fillStyle = "#ffd740"; fitFont("★" + c.evo, cw - 8, 14); ctx.fillText("★" + c.evo, cx + cw / 2, ry + 26);
        ctx.fillStyle = "#bcaaa4"; fitFont(`(${c.name})`, cw - 8, 11, "normal"); ctx.fillText(`(${c.name})`, cx + cw / 2, ry + 44);
        ctx.fillStyle = "#ffd740"; ctx.font = "bold 11px sans-serif"; ctx.fillText("進化!", cx + cw / 2, ry + 60);
      } else {
        ctx.fillStyle = "#fff"; fitFont(c.name, cw - 8, 14); ctx.fillText(c.name, cx + cw / 2, ry + 28);
        const pw = 12, pg = 3, px = cx + (cw - (pw * CARD_RULES.maxLevel + pg * (CARD_RULES.maxLevel - 1))) / 2;   // レベルの目盛り
        for (let k = 0; k < CARD_RULES.maxLevel; k++) { ctx.fillStyle = k < c.lv ? col : "#37474f"; ctx.fillRect(px + k * (pw + pg), ry + 40, pw, 8); }
        ctx.fillStyle = "#90a4ae"; ctx.font = "11px sans-serif"; ctx.fillText(c.lv >= CARD_RULES.maxLevel ? "Lv MAX" : `Lv ${c.lv}`, cx + cw / 2, ry + 62);
      }
    }
  });
}

function buildText() {
  const list = CARDS.filter(c => lv(c.id) > 0).map(c => S.evolved[c.id] ? `★${EVO_OF[c.id].name}` : `${c.name}${lv(c.id)}`);
  return list.length ? "ビルド: " + list.join(" / ") : "ビルド: なし";
}

function drawWorld() {
  // 減速フィールド
  if (lv("slow")) {
    const R = slowRadius(), grav = S.evolved.slow;
    const c = grav ? "179,136,255" : "100,181,246";   // 重力場は紫
    ctx.beginPath(); ctx.arc(P.x, P.y, R, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${c},${grav ? 0.10 + 0.04 * Math.sin(S.time * 4) : 0.07})`; ctx.fill();
    ctx.strokeStyle = `rgba(${c},${grav ? 0.55 : 0.35})`; ctx.lineWidth = grav ? 2.5 : 1.5;
    ctx.setLineDash([6, 6]); ctx.lineDashOffset = grav ? -S.time * 30 : 0; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  // 地雷
  for (const m of mines) {
    ctx.fillStyle = m.armed > 0 ? "#795548" : m.leap ? "#ffd740" : "#ffab40";
    ctx.fillRect(m.x - 9, GY - 5, 18, 5);
    if (m.leap) { ctx.fillStyle = "#ffd740"; ctx.fillRect(m.x - 5, GY - 9, 10, 4); }   // 跳躍地雷はバネ付き
    if (m.armed <= 0 && Math.floor(S.time * 4) % 2) { ctx.fillStyle = "#ff5252"; ctx.fillRect(m.x - 2, GY - 8, 4, 3); }
  }
  for (const g of gems) { ctx.fillStyle = "#69f0ae"; diamond(g.x, g.y, 5); }
  for (const it of items) {
    const I = ITEMS[it.type];
    if (!it.tut && it.t > 5 && Math.floor(it.t * 8) % 2) continue;
    if (it.lock > 0) {   // まだ取れないあいだは薄く表示し、残り時間を輪で示す
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(it.x, it.y, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (it.lock / TUT_ITEM_LOCK)); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(it.x, it.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = I.color; ctx.stroke();
    ctx.fillStyle = I.color; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(I.label, it.x, it.y + 1); ctx.textBaseline = "alphabetic";
    if (it.caption) { ctx.font = "bold 13px sans-serif"; ctx.fillText(it.caption, it.x, it.y + 34); }   // チュートリアル用の説明
    ctx.globalAlpha = 1;
  }
  for (const c of corpses) drawCorpse(c);
  const titan = FINAL.overlapAlpha < 1 && enemies.find(e => e.type === "titan" && e.hp > 0 && e.art);
  for (const e of enemies) {
    const see = titan && e !== titan && overTitan(e, titan);   // 大巨兵に重なった敵は透かして、大巨兵の姿を見せる
    if (see) ctx.globalAlpha = FINAL.overlapAlpha;
    drawEnemy(e);
    if (see) ctx.globalAlpha = 1;
  }
  for (const eb of ebullets) drawEnemyBullet(eb);
  // 砲台(画像があれば画像、無ければ図形)
  if (lv("ground")) for (const side of [-1, 1]) {
    const u = groundUnit(side);
    if (TART.ground.ok) drawTurretSprite(TART.ground, u.cx, u.w, u.h, side < 0, S.evolved.ground);   // 左側は左右反転
    else {
      const p = u.muzzle; p.x = u.cx;
      if (S.evolved.ground) { ctx.fillStyle = "#ff9100"; ctx.fillRect(p.x - 14, p.y - 12, 28, 26); }
      else { ctx.fillStyle = "#ffb74d"; ctx.fillRect(p.x - 10, p.y - 6, 20, 20); }
    }
  }
  if (lv("flak")) for (let i = 0; i < (S.evolved.flak ? 3 : 1); i++) {
    const u = flakUnit(i);
    if (TART.flak.ok) drawTurretSprite(TART.flak, u.cx, u.w, u.h, u.flip, S.evolved.flak);
    else {
      const p = u.muzzle;
      ctx.fillStyle = "#37474f"; ctx.fillRect(p.x - 3, p.y, 6, GY - p.y);
      ctx.fillStyle = S.evolved.flak ? "#18ffff" : "#4dd0e1"; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
    }
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
      ctx.strokeStyle = f.color || "#fff59d"; ctx.lineWidth = 3; ctx.globalAlpha = f.life / 0.15;
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
  if (PAPER.enabled) return drawEnemyPaper(e);
  if (e.art) drawEnemyArt(e, false, false); else drawEnemyShape(e);
  drawEnemyMarks(e, 0);
}

// 敵の絵を描く。右から来る敵は左右反転して自機の方を向かせる
function drawEnemyArt(e, paper, withShadow) {
  const v = e.art.tiers[e.tier] || e.art.tiers[0], w = e.artW, h = e.artH, pad = paper ? PAPER.border : 0, flip = e.x > P.x;
  const put = (src, dx, dy) => {
    ctx.save(); ctx.translate(e.x + dx, e.y + dy); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(src, -w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2); ctx.restore();
  };
  if (withShadow) { const a = ctx.globalAlpha; ctx.globalAlpha = a * PAPER.shadow.alpha; put(v.shadow, PAPER.shadow.dx, PAPER.shadow.dy); ctx.globalAlpha = a; }
  put(paper ? v.paper : v.plain, 0, 0);
  if (e.flash > 0) put(paper ? v.paperWhite : v.white, 0, 0);
}

// 敵の形を塗る(紙風でも従来でも共通)
function drawEnemyShape(e) {
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
}

// 上位種の輪・減速の印・HPバー(oy = 跳ねている分の上下のずれ)
function drawEnemyMarks(e, oy) {
  if (e.tier > 0) {   // 上位種は輪で示す。色だけに頼らないよう、段階の数だけ輪を重ねる(強化1本・精鋭2本・異形3本)
    ctx.strokeStyle = e.T.tint; ctx.lineWidth = 2;
    const rr = e.art ? Math.max(e.r, e.artH * 0.5) : e.r;   // 絵のある敵は絵を囲む大きさに
    for (let i = 0; i < e.tier; i++) { ctx.beginPath(); ctx.arc(e.x, e.y + oy, rr + 5 + i * 5, 0, Math.PI * 2); ctx.stroke(); }
  }
  if (e.spdMul < 1) { ctx.fillStyle = "#64b5f6"; ctx.fillRect(e.x - 3, e.y + oy + e.r + 3, 6, 3); }  // 減速中の印
  if (e.hp < e.maxHp) {
    const w = e.r * 2, top = e.art ? e.artH / 2 : e.r;   // HPバーは見た目の上端の上
    ctx.fillStyle = "#000a"; ctx.fillRect(e.x - w / 2, e.y + oy - top - 9, w, 4);
    ctx.fillStyle = "#ff5252"; ctx.fillRect(e.x - w / 2, e.y + oy - top - 9, w * Math.max(0, e.hp / e.maxHp), 4);
  }
}

// 敵の外形(紙風の白フチと影に使う)
function enemyPath(e) {
  const p = new Path2D(), k = e.d.kind;
  if (k === "ground") p.rect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
  else if (k === "side") {
    const wing = Math.sin(e.t * 18) * 8;
    p.moveTo(e.x - e.r * 1.8, e.y + wing); p.lineTo(e.x, e.y - 4); p.lineTo(e.x + e.r * 1.8, e.y + wing); p.lineTo(e.x, e.y + e.r); p.closePath();
  } else if (k === "air") { p.moveTo(e.x, e.y + e.r * 1.3); p.lineTo(e.x - e.r, e.y - e.r); p.lineTo(e.x + e.r, e.y - e.r); p.closePath(); }
  else p.arc(e.x, e.y, e.r, 0, Math.PI * 2);
  return p;
}

// 紙の人形らしい姿勢: 地上の敵は跳ねながら進み、空の敵はひらひら傾く。被弾するとつぶれる
function enemyPose(e) {
  const k = e.d.kind, pose = { hop: 0, rot: 0, sx: 1, sy: 1, ax: e.x, ay: e.y };
  if (k === "ground") {
    pose.ay = e.art ? e.y + e.artH / 2 : e.y + e.r;   // 足元を基準に変形する
    const moving = e.speed > 0 && e.spdMul > 0;
    if (moving) pose.hop = Math.abs(Math.sin(e.t * PAPER.hop.speed * e.spdMul)) * PAPER.hop.height * (e.d.boss ? 0.6 : 1);
    if (moving && pose.hop < 1.2) { pose.sx = 1.08; pose.sy = 0.92; }   // 着地の瞬間にむにっとつぶれる
  } else if (k === "air") pose.rot = Math.sin(e.t * 3) * 0.18;
  else if (k === "side") pose.rot = Math.sin(e.t * 4) * 0.1;
  else if (k === "hover") pose.rot = Math.sin(e.t * 2) * 0.08;
  if (e.flash > 0) { pose.sx *= 1.15; pose.sy *= 0.85; }
  return pose;
}

function paperTransform(pose) {
  ctx.translate(pose.ax, pose.ay - pose.hop); ctx.rotate(pose.rot); ctx.scale(pose.sx, pose.sy); ctx.translate(-pose.ax, -pose.ay);
}

// 白いフチと影を付けて描く
function paperOutline(path, withShadow) {
  ctx.lineJoin = "round"; ctx.lineWidth = PAPER.border * 2;
  if (withShadow) {
    ctx.save(); ctx.translate(PAPER.shadow.dx, PAPER.shadow.dy);
    ctx.fillStyle = ctx.strokeStyle = `rgba(0,0,0,${PAPER.shadow.alpha})`; ctx.fill(path); ctx.stroke(path);
    ctx.restore();
  }
  ctx.strokeStyle = PAPER.borderColor; ctx.stroke(path);
}

function drawEnemyPaper(e) {
  const pose = enemyPose(e);
  if (e.d.kind === "ground") {   // 地面に落ちる影(跳ねると小さく薄くなる)
    const f = 1 - pose.hop / 30;
    ctx.fillStyle = `rgba(0,0,0,${0.3 * f})`; ctx.beginPath(); ctx.ellipse(e.x, GY + 1, e.r * 1.1 * f, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save(); paperTransform(pose);
  if (e.art) drawEnemyArt(e, true, true);
  else { paperOutline(enemyPath(e), true); drawEnemyShape(e); }
  ctx.restore();
  drawEnemyMarks(e, -pose.hop);
}

// 撃破された敵: 地上の敵はぴょんと浮いてから奥へパタンと倒れ、空の敵はくるくる回りながら落ちる
function drawCorpse(c) {
  const e = c.e, life = PAPER.fallTime * (e.d.kind === "ground" ? 1 : 1.6), k = Math.min(1, c.t / life);
  ctx.save();
  ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
  if (e.d.kind === "ground") {
    const ax = e.x, ay = e.art ? e.y + e.artH / 2 : e.y + e.r, pop = Math.sin(Math.min(1, k * 2.5) * Math.PI) * 10;
    ctx.translate(ax, ay - pop); ctx.transform(1, 0, c.dir * 0.4 * k, 1, 0, 0); ctx.scale(1, Math.max(0.02, Math.cos(k * Math.PI / 2))); ctx.translate(-ax, -ay);
  } else {
    const fall = 900 * c.t * c.t / 2 - 120 * c.t;
    ctx.translate(e.x + c.dir * 40 * k, e.y + fall); ctx.rotate(c.dir * k * 3); ctx.scale(1, Math.cos(k * Math.PI * 2)); ctx.translate(-e.x, -e.y);
  }
  if (e.art) drawEnemyArt(e, PAPER.enabled, false);
  else { paperOutline(enemyPath(e), false); drawEnemyShape(e); }
  ctx.restore();
}

function drawPlayer() {
  if (S.invuln > 0 && Math.floor(S.invuln * 15) % 2) ctx.globalAlpha = 0.35;   // 無敵中は点滅
  if (ART.body.ok && ART.barrel.ok) {
    if (PAPER.enabled && ART.body.paper) {
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(P.x, GY + 1, PLAYER_ART.body.width * 0.52, 6, 0, 0, Math.PI * 2); ctx.fill();
      drawPlayerArt("shadow");
    }
    drawPlayerArt("main");
  } else drawPlayerShapes();
  ctx.globalAlpha = 1;
  if (S.shield > 0 && !(S.shield < 2 && Math.floor(S.shield * 8) % 2)) {
    const r = PR + 18 + Math.sin(S.time * 6) * 2;
    ctx.beginPath(); ctx.arc(P.x, P.y - 6, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(77,208,225,0.15)"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(77,208,225,0.85)"; ctx.stroke();
  }
}

// 画像で描く: 本体 → 砲身 → 回転台のフタ の順に重ねる
// 地面に置く砲台の画像を描く(紙風なら白フチ・影付き。進化していれば金フチ)
function drawTurretSprite(im, cx, w, h, flip, evolved) {
  const paper = PAPER.enabled && !!im.paper, pad = paper ? PAPER.border : 0, x = cx - w / 2, y = GY - h;
  const put = (src, dx, dy) => {
    ctx.save(); ctx.translate(cx + dx, 0); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(src, -w / 2 - pad, y + dy - pad, w + pad * 2, h + pad * 2); ctx.restore();
  };
  if (paper) {
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(cx, GY + 1, w * 0.5, 4, 0, 0, Math.PI * 2); ctx.fill();
    const a = ctx.globalAlpha; ctx.globalAlpha = a * PAPER.shadow.alpha; put(im.paperShadow, PAPER.shadow.dx, PAPER.shadow.dy); ctx.globalAlpha = a;
    put(evolved ? im.paperGold : im.paper, 0, 0);
  } else {
    put(im, 0, 0);
    if (evolved) { ctx.fillStyle = TURRET_ART.evolvedBorder; ctx.fillRect(x, GY - 3, w, 3); }   // 進化の印
  }
}

// pass: "shadow" = 紙の影だけを描く / "main" = 本体を描く
function drawPlayerArt(pass = "main") {
  const A = PLAYER_ART, bw = A.body.width, bh = A.body.height;
  const paper = PAPER.enabled && !!ART.body.paper, pad = paper ? PAPER.border : 0, shadow = pass === "shadow";
  const flash = !shadow && S.hurtFlash > 0 ? Math.min(1, S.hurtFlash / 0.3) * 0.8 : 0;   // 被弾直後は白く光らせる
  if (shadow) { ctx.save(); ctx.translate(PAPER.shadow.dx, PAPER.shadow.dy); ctx.globalAlpha *= PAPER.shadow.alpha; }
  const drawLit = (im, x, y, w, h) => {
    const src = shadow ? im.paperShadow : paper ? im.paper : im;
    ctx.drawImage(src, x - pad, y - pad, w + pad * 2, h + pad * 2);
    const wh = paper ? im.paperWhite : im.white;
    if (flash && wh) { const a = ctx.globalAlpha; ctx.globalAlpha = a * flash; ctx.drawImage(wh, x - pad, y - pad, w + pad * 2, h + pad * 2); ctx.globalAlpha = a; }
  };
  drawLit(ART.body, P.x - bw / 2, GY - bh, bw, bh);
  // 砲身: 回転軸を中心に回す。左を向いているときは上下反転して、ハイライトを常に上側に保つ
  const len = A.barrel.length, th = A.barrel.thickness * (1 + 0.06 * lv("caliber"));   // 大口径弾で太くなる
  ctx.save(); ctx.translate(AIM.x, AIM.y); ctx.rotate(S.aimAngle);
  if (Math.cos(S.aimAngle) < 0) ctx.scale(1, -1);
  drawLit(ART.barrel, -len * A.barrel.pivotX, -th / 2, len, th);
  ctx.restore();
  // 回転台のフタ
  const r = A.cap.radius;
  if (shadow) { ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(AIM.x, AIM.y, r + pad, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
  if (paper) { ctx.fillStyle = PAPER.borderColor; ctx.beginPath(); ctx.arc(AIM.x, AIM.y, r + pad, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.arc(AIM.x, AIM.y, r, 0, Math.PI * 2);
  ctx.fillStyle = flash ? "#ffffff" : A.cap.color; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = A.cap.outline; ctx.stroke();
  ctx.beginPath(); ctx.arc(AIM.x - r * 0.3, AIM.y - r * 0.32, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fill();
}

// 画像が無いときの代わり(これまでの図形)
function drawPlayerShapes() {
  ctx.fillStyle = "#455a64"; ctx.fillRect(P.x - 28, GY - 12, 56, 12);
  ctx.save(); ctx.translate(AIM.x, AIM.y); ctx.rotate(S.aimAngle);
  ctx.fillStyle = "#cfd8dc"; ctx.fillRect(0, -5 - lv("caliber") * 0.6, MUZZLE, 10 + lv("caliber") * 1.2);
  ctx.restore();
  ctx.beginPath(); ctx.arc(P.x, P.y, PR - 4, 0, Math.PI * 2);
  ctx.fillStyle = S.hurtFlash > 0 ? "#ff8a80" : "#90caf9"; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "#1e88e5"; ctx.stroke();
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
  ctx.fillText(`[T] エイム: ${autoAim ? "オート" : "マウス"}   [P] ポーズ   [M] 音 ${sound.muted ? "OFF" : "ON"}   [G] 紙風 ${PAPER.enabled ? "ON" : "OFF"}   [F] 手前 ${frontOn ? "ON" : "OFF"}   [D] 数値表示`, 16, H - 16);
  if (!tut || tut.heatOn) drawScoreHeat();
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
      ctx.strokeStyle = "#000"; ctx.lineWidth = 4; ctx.strokeText("右クリックでボム!", P.x, GY - 150); ctx.fillText("右クリックでボム!", P.x, GY - 150);
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

// 画面上部の中央: スコアと熱量
function drawScoreHeat() {
  const cx = W / 2, k = (S.heat - HEAT.min) / (HEAT.max - HEAT.min);
  if (tut && tut.heatOn) {   // チュートリアル: ゲージを点滅する枠で囲んで、どこを見ればいいか示す
    ctx.strokeStyle = `rgba(240,228,66,${0.5 + 0.5 * Math.sin(performance.now() / 150)})`; ctx.lineWidth = 3;
    ctx.strokeRect(cx - 104, 6, 290, 52);
  }
  ctx.textAlign = "center"; ctx.font = "bold 22px sans-serif"; ctx.fillStyle = "#ffffff";
  ctx.fillText(S.score.toLocaleString(), cx, 30);
  const bw = 180, bx = cx - bw / 2, by = 40;
  ctx.fillStyle = "#000a"; ctx.fillRect(bx, by, bw, 8);
  ctx.fillStyle = k < 0.33 ? "#f0e442" : k < 0.66 ? "#e69f00" : "#d55e00"; ctx.fillRect(bx, by, bw * k, 8);
  ctx.strokeStyle = "#ffffff55"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 8);
  ctx.font = "bold 12px sans-serif"; ctx.fillStyle = "#e0e0e0"; ctx.textAlign = "left";
  ctx.fillText(`熱量 ×${S.heat.toFixed(1)}`, bx + bw + 8, by + 8);
  ctx.textAlign = "left";
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
  const interval = spawnInterval();
  const shares = TIERS.map((T, i) => { let p = tierShare(i); for (let j = i + 1; j < TIERS.length; j++) p *= 1 - tierShare(j); return p; });
  const lines = [
    `主砲の秒間ダメージ目安: ${(S.dmgMul * S.caliberMul * S.multi / fi).toFixed(1)}(全弾命中時)`,
    `1発: ${(S.dmgMul * S.caliberMul).toFixed(2)} / 弾数 ${S.multi} / 貫通 ${S.pierce} / 跳弾 ${S.bounce}`,
    `出現間隔: ${interval.toFixed(2)}秒 × ${1 + Math.floor(S.time / SPAWN.batchEvery)}体 / 画面上の敵 ${enemies.length}体`,
    `次のレベルまで: ${Math.ceil(S.xpNext - S.xp)} / ${S.xpNext}(経験値×${S.xpMul.toFixed(2)})`,
    `熱量 ×${S.heat.toFixed(2)} → 出現の速さ ×${heatSpawnMul().toFixed(2)} / 1体で +${heatPerKill().toFixed(4)}`,
    `Lv ${S.level}(ビルド完成の目安は Lv44 ごろ)`,
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
  if ((state === "over" || state === "clear") && now - lastInput > EVENT.idleToTitle * 1000) endAction(1);   // 放置されたらタイトルへ
  prevState = state;
  bgm.update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// デバッグ用(ブラウザのコンソールから確認できる)
window.__tw = { EVOLUTIONS, get tut() { return tut; }, MODE, FINAL, get S() { return S; }, get enemies() { return enemies; }, get state() { return state; }, startGame, CARDS, recalc };
