"use strict";
// ============================================================
//  TridentWave 設定ファイル
//  難易度やバランスを調整したいときは、このファイルの数値だけを書き換えればOK。
//  書き換えたら保存して、ブラウザを再読み込みすると反映されます。
//  (ゲームの処理そのものは game.js にあります)
// ============================================================

// ============================================================
//  調整用の設定(ここの数値を変えて難易度やバランスを調整)
// ============================================================

// ---- 出現ペース ----
const SPAWN = {
  startInterval: 2.5,   // 開始時の出現間隔(秒)。大きいほどゆっくり
  minInterval: 0.5,     // 最短の出現間隔(秒)。これ以上は速くならない
  rampPerSec: 0.004,    // 1秒ごとに間隔が縮む量。小さいほど激しくなるのが遅い
  batchEvery: 120,      // この秒数ごとに、1回に出る敵の数が +1
};

// ---- 敵の段階(時間で色違いの上位種が混ざる。各段階の始まりに巨兵が来る) ----
// at: 出現し始める時間(秒) / hp: HP倍率 / xp: 経験値倍率 / dmg: 自機へのダメージ倍率 / tint: 色
const TIERS = [
  { name: "通常個体", at: 0,   hp: 1,  xp: 1,   dmg: 1,   tint: "#ffffff" },
  { name: "強化個体", at: 120, hp: 2,  xp: 1.5, dmg: 1.3, tint: "#f0e442" },  // 黄  輪1本
  { name: "精鋭個体", at: 240, hp: 4,  xp: 2,   dmg: 1.6, tint: "#d55e00" },  // 朱  輪2本
  { name: "異形個体", at: 390, hp: 7,  xp: 3,   dmg: 2,   tint: "#cc79a7" },  // 赤紫 輪3本
];
const TIER_MIX = {
  ramp: 90,         // 上位種が出始めてから、最大の割合になるまでの秒数
  maxShare: 0.85,   // 上位種の割合の上限(0〜1)。残りは1つ下の段階の敵
};
const FINAL = {
  bossAt: 540,      // 最終ボス(大巨兵)が来る時間(秒) 540 = 9:00
  clearAt: 600,     // この時間まで生き残ればクリア(秒) 600 = 10:00
};

// ---- ゲームの長さ ----
// "normal" = 10分でクリア / "short" = 5分でクリア(イベント用の短縮版)
// ファイル名の後ろに ?mode=short を付けて開いても切り替えられる(例: index.html?mode=short)
// 上に書いた時間の値(段階・ボス・クリア・出現ペース)は「10分モードの値」。短縮版では自動で縮める
const MODE_DEFAULT = "normal";
const MODES = {
  normal: { label: "10分モード", timeScale: 1,   xpMul: 1 },
  short:  { label: "5分モード",  timeScale: 0.5, xpMul: 1.8 },  // 時間を半分に。成長が間に合うよう経験値を増やす
};

// ---- イベント向け ----
const EVENT = {
  idleToTitle: 30,  // ゲームオーバー/クリア画面で操作がないと、この秒数でタイトルへ戻る(次の人はチュートリアルから)
};

// ---- レベルアップに必要な経験値: base + Lv × perLevel + Lv ^ pow ----
const LEVEL = { base: 6, perLevel: 4, pow: 1.4 };

// ---- カードの枠 ----
const CARD_RULES = { weaponSlots: 4, passiveSlots: 4, maxLevel: 5 };

// ---- ボム ----
const BOMB = { start: 1, max: 3, dmgPerTierHp: 12 };  // ダメージ = 12 × その時点の段階のHP倍率

// ---- シールド(アイテム S) ----
const SHIELD = { duration: 8 };   // ダメージを受けない時間(秒)

// ---- 被弾時の無敵と押し返し ----
const HURT = {
  invuln: 0.8,       // 被弾後の無敵時間(秒)。この間は点滅し、ダメージを受けない
  pushRadius: 100,   // 被弾した瞬間に押し返す範囲(自機からの距離)
  push: 70,          // 押し返す距離。ダメージは与えない(ボスは15%だけ)
};

// ---- 武装の性能(L = カードのレベル 1〜5)。ダメージには「火力強化」も掛かる ----
const WEAPON = {
  ground:  { interval: L => 1.1 * Math.pow(0.85, L - 1), dmg: L => 1.5 + 0.5 * L, knock: L => 20 + 10 * L },
  flak:    { interval: L => 1.5 - 0.12 * L, dmg: L => 1.2 + 0.5 * L, radius: L => 40 + 10 * L },
  mine:    { interval: L => 3.2 - 0.3 * L, dmg: L => 4 + 2 * L, max: L => 2 + L, radius: L => 50 + 6 * L },
  missile: { interval: L => 2.4 - 0.2 * L, dmg: L => 3 + 1.5 * L, count: L => 1 + Math.floor(L / 2) },
  thunder: { interval: L => 1.6 - 0.15 * L, dmg: L => 1.5 + 0.6 * L, chain: L => 2 + L },
  nova:    { interval: L => 5 - 0.5 * L, dmg: L => 2 + L, radius: L => 110 + 20 * L, knock: L => 60 + 15 * L },
  slow:    { radius: L => 130 + 25 * L, factor: L => Math.min(0.65, 0.25 + 0.08 * L) },
};

// ---- 強化の効果(1Lvごと) ----
const PASSIVE = {
  power: 0.20,         // 火力強化: 全武器のダメージ +20%
  rate: 0.85,          // 連射機構: 発射間隔 ×0.85
  caliberSize: 2,      // 大口径弾: 弾の半径 +2
  caliberDmg: 0.15,    //           威力 +15%
  caliberSpeed: 0.10,  //           弾速 -10%
  armorHp: 25,         // 装甲板: 最大HP +25
  armorCut: 0.05,      //         受けるダメージ -5%
  regen: 0.6,          // 自己修復: 毎秒HP +0.6
  learn: 0.15,         // 学習回路: 経験値 +15%
};

// ---- 進化(武装Lv5 + 対応する強化Lv5 で、レベルアップ時に候補に出る) ----
const EVOLVE = {
  cluster:   { bomblets: 6, bombletDmg: 0.5, bombletRadius: 38 },   // クラスターミサイル: 子爆弾の数・威力(ミサイル比)・爆発範囲
  aaBattery: { barrels: 3, pops: 3, radiusMul: 1.2 },               // 高射砲陣地: 砲身の数・1発が爆発する回数・炸裂範囲の倍率
  heavy:     { dmgMul: 2.5, blastRadius: 55, knockMul: 1.5, intervalMul: 1.2 },  // 重砲台: 威力倍率・着弾爆発の範囲・押し戻し倍率・発射間隔倍率
};
const EVOLUTIONS = [
  { id: "cluster",   from: "missile", with: "boom",    name: "クラスターミサイル", desc: "着弾すると子爆弾をばらまき、周りを巻き込む" },
  { id: "aaBattery", from: "flak",    with: "pierce",  name: "高射砲陣地",         desc: "砲身が3本に。炸裂弾が敵を貫き、何度も爆発する" },
  { id: "heavy",     from: "ground",  with: "caliber", name: "重砲台",             desc: "一撃が重くなり、着弾点が爆発する" },
];

// ============================================================
//  カード一覧
// ============================================================
const CARDS = [
  // ---- 武装(4枠) ----
  { id: "ground",  type: "weapon", name: "地上砲台",     desc: () => "左右に砲台を置き、地上の敵を撃って押し戻す", up: "連射・押し戻す力・威力アップ" },
  { id: "flak",    type: "weapon", name: "対空砲台",     desc: () => "上空の敵の近くで炸裂する弾を撃つ",           up: "炸裂範囲・連射・威力アップ" },
  { id: "mine",    type: "weapon", name: "地雷",         desc: () => "左右の地面に地雷を置く。地上の敵が踏むと爆発", up: "設置数・威力アップ" },
  { id: "missile", type: "weapon", name: "誘導ミサイル", desc: () => "HPが一番高い敵を追いかけるミサイルを撃つ",   up: "発射数・威力アップ" },
  { id: "thunder", type: "weapon", name: "雷撃",         desc: () => "近くの敵に雷を落とし、次々と連鎖させる",     up: "連鎖数・連射・威力アップ" },
  { id: "nova",    type: "weapon", name: "衝撃波",       desc: () => "周りの敵を定期的に吹き飛ばす。敵弾も消す",   up: "範囲・間隔・威力アップ" },
  { id: "slow",    type: "weapon", name: "減速フィールド", desc: () => "自機の周りに入った敵の動きを遅くする",     up: "範囲・減速率アップ" },
  // ---- 強化(4枠) ----
  { id: "power",   type: "passive", name: "火力強化", desc: () => `全武器のダメージ +${PASSIVE.power * 100}%` },
  { id: "rate",    type: "passive", name: "連射機構", desc: () => `主砲の発射間隔 -${Math.round((1 - PASSIVE.rate) * 100)}%` },
  { id: "spread",  type: "passive", name: "拡散砲身", desc: () => "主砲の弾 +1(扇状に広がる)" },
  { id: "pierce",  type: "passive", name: "貫通弾芯", desc: () => "主砲の弾が敵を +1体 貫通" },
  { id: "caliber", type: "passive", name: "大口径弾", desc: () => `主砲の弾が大きくなり威力 +${PASSIVE.caliberDmg * 100}%、弾速 -${PASSIVE.caliberSpeed * 100}%` },
  { id: "boom",    type: "passive", name: "爆裂弾頭", desc: () => "主砲の弾が命中時に爆発(Lvで範囲拡大)" },
  { id: "bounce",  type: "passive", name: "跳弾",     desc: () => "主砲の弾が画面端や地面で +1回 跳ね返る" },
  { id: "armor",   type: "passive", name: "装甲板",   desc: () => `最大HP +${PASSIVE.armorHp}、受けるダメージ -${PASSIVE.armorCut * 100}%` },
  { id: "regen",   type: "passive", name: "自己修復", desc: () => `毎秒 HP +${PASSIVE.regen} 回復` },
  { id: "learn",   type: "passive", name: "学習回路", desc: () => `獲得経験値 +${PASSIVE.learn * 100}%` },
  // ---- 補充(上限なし。候補が足りないときやHPが減ったときに出る) ----
  { id: "heal",    type: "filler", name: "緊急修理", desc: () => "HPを30%回復" },
  { id: "bombup",  type: "filler", name: "ボム補充", desc: () => "ボムのストック +1" },
];

// ============================================================
//  敵の定義
// ============================================================
// kind: ground=左右の地上 / side=左右の空中 / air=上から降下 / hover=上空に留まって撃つ
const ENEMY = {
  grunt:   { name: "歩兵",     hp: 1,   speed: 42,  r: 14, color: "#e05a5a", dmg: 8,  xp: 1,   kind: "ground", from: 0 },
  runner:  { name: "突撃兵",   hp: 1,   speed: 115, r: 11, color: "#f2a33a", dmg: 6,  xp: 1,   kind: "ground", from: 25 },
  bat:     { name: "コウモリ", hp: 1,   speed: 70,  r: 11, color: "#b86bff", dmg: 5,  xp: 1,   kind: "side",   from: 15 },
  diver:   { name: "降下兵",   hp: 2,   speed: 55,  r: 13, color: "#4fc3f7", dmg: 8,  xp: 2,   kind: "air",    from: 0 },
  brute:   { name: "重装兵",   hp: 8,   speed: 24,  r: 22, color: "#8d6e63", dmg: 20, xp: 5,   kind: "ground", from: 60 },
  spitter: { name: "砲撃手",   hp: 3,   speed: 40,  r: 15, color: "#66bb6a", dmg: 0,  xp: 4,   kind: "hover",  from: 90 },
  boss:    { name: "巨兵",     hp: 60,  speed: 16,  r: 40, color: "#d84315", dmg: 30, xp: 30,  kind: "ground", from: 99999, boss: true },
  dummy:   { name: "的",       hp: 3,   speed: 0,   r: 18, color: "#90a4ae", dmg: 0,  xp: 1,   kind: "dummy",  from: 99999 },  // チュートリアル用
  titan:   { name: "大巨兵",   hp: 250, speed: 10,  r: 60, color: "#b71c1c", dmg: 25, xp: 100, kind: "ground", from: 99999, boss: true },
};
const SPAWN_WEIGHT = { grunt: 10, runner: 5, bat: 5, diver: 6, brute: 2, spitter: 1.5 };

// ---- ドロップアイテム(撃って取る) ----
const ITEMS = {
  heart:  { label: "♥", color: "#ff5c8a", desc: "HP+25" },
  bomb:   { label: "B", color: "#ffd54f", desc: "ボム +1" },
  shield: { label: "S", color: "#4dd0e1", desc: `${SHIELD.duration}秒間 シールド` },
};

// ---- 自機の画像(assets フォルダ) ----
// 画像が見つからないときは、これまでの図形で描きます
const PLAYER_ART = {
  body:   { src: "assets/player_body.png", width: 96, height: 69 },   // 画面上の表示サイズ(px)。画像の縦横比に合わせる
  pivot:  { x: 0.5, y: 0.078 },   // 本体画像の中で、砲身の回転軸になる位置(左上=0,0 / 右下=1,1)。いまは頭頂部の穴
  barrel: { src: "assets/player_barrel.png", length: 52, thickness: 22, pivotX: 0.23 },  // 砲身の表示サイズと、回転軸の位置(画像の左端から何割)
  cap:    { radius: 12, color: "#45c7f4", outline: "#0b1e4a" },     // 回転台のフタ(プログラムで描く円)
  hitRadius: 34,                  // 自機の当たり判定の半径
  maxDownAngle: 40,               // 砲身を水平より何度下まで向けられるか。小さいと近くの地上の敵に届かなくなる
};
