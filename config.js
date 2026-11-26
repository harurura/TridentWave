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
  startInterval: 2.2,   // 開始時の出現間隔(秒)。大きいほどゆっくり
  minInterval: 0.5,     // 最短の出現間隔(秒)。これ以上は速くならない
  rampPerSec: 0.004,    // 1秒ごとに間隔が縮む量。小さいほど激しくなるのが遅い
  batchEvery: 120,      // この秒数ごとに、1回に出る敵の数が +1
};

// ---- 敵の段階(時間で色違いの上位種が混ざる。各段階の始まりに巨兵が来る) ----
// at: 出現し始める時間(秒) / hp: HP倍率 / xp: 経験値倍率 / score: 点数倍率 / dmg: 自機へのダメージ倍率 / tint: 色
// xp は前半の段階ほど多めにして、ビルドが6:30〜7:00ごろに完成するようにしてある(異形個体のころはほぼ完成済み)
const TIERS = [
  { name: "通常個体", at: 0,   hp: 1,  xp: 2,   score: 1,   dmg: 1,   tint: "#ffffff" },
  { name: "強化個体", at: 120, hp: 2,  xp: 4,   score: 1.5, dmg: 1.3, tint: "#f0e442" },  // 黄  輪1本
  { name: "精鋭個体", at: 240, hp: 4,  xp: 6,   score: 2,   dmg: 1.6, tint: "#d55e00" },  // 朱  輪2本
  { name: "異形個体", at: 390, hp: 7,  xp: 3,   score: 3,   dmg: 2,   tint: "#cc79a7" },  // 赤紫 輪3本
];
const TIER_MIX = {
  ramp: 90,         // 上位種が出始めてから、最大の割合になるまでの秒数
  maxShare: 0.85,   // 上位種の割合の上限(0〜1)。残りは1つ下の段階の敵
};
const FINAL = {
  bossAt: 540,      // 最終ボス(大巨兵)が来る時間(秒) 540 = 9:00
  clearAt: 600,     // この時間まで生き残ればクリア(秒) 600 = 10:00
  // 大巨兵の姿を見せるための演出
  roar: true,        // 登場時の咆哮で、地上の敵を吹き飛ばす(点数・経験値・熱量は入らない)
  calmSec: 3,        // 咆哮のあと、敵が出てこない秒数(全身を見せる時間)
  overlapAlpha: 0.45,// 大巨兵に重なった敵の不透明度(0〜1)。1 にすると半透明にしない
};

// ---- 終盤の巨兵の増援(ビルドが完成して単調になりやすい 7〜9分に山場を作る) ----
// 決まった時間に巨兵がもう一度来る。熱量が高いと2体になり、左右から挟み撃ちにしてくる
const REINFORCE = {
  enable: true,
  at: [435, 495],    // 来る時間(秒) 435 = 7:15 / 495 = 8:15
  heatFor2: 4.5,     // このときの熱量がこれ以上なら2体(左右から)、未満なら1体
  hpMul: 1.4,        // 増援の巨兵のHP倍率(通常の巨兵 × これ)
};

// ---- 巨兵・大巨兵の動き(押し戻され続けて近づけない、を防ぐ) ----
const BOSS_MOVE = {
  enterSpeed: 90,    // 巨兵が画面に入ってくる速さ。体が全部画面に入るまでは押し戻されない(大巨兵はゆっくりのまま)
  // 踏ん張り(巨兵): 押し戻された距離がたまると、しばらく押し戻されなくなる
  braceAt: 90,       // 押し戻された距離(px)の合計がこれを超えると踏ん張る
  braceDecay: 15,    // 押し戻された距離の合計が、1秒にこれだけ減る
  braceSec: 4,       // 踏ん張っている時間(秒)
  // 突進(巨兵): 立ち止まって身構え(予告)、前へ一気にダッシュする。身構え・突進の間は押し戻されない
  dashFirst: 3,      // 画面に入ってから最初の突進まで(秒)
  dashEvery: 6,      // 突進の間隔(秒)
  crouch: 1.0,       // 身構える時間(予告)
  dashSpeed: 280,    // 突進の速さ
  dashDist: 200,     // 突進で進む距離(px)
};

// ---- 大巨兵のミサイル(背中から3発を打ち上げ、左上・真上・右上から回り込んで襲ってくる) ----
// 主砲で撃ち落とせる。最優先で壊さないと痛い。ボムを使えば消せる
const BOSS_SHELL = {
  enable: true,
  interval: 5.0,       // 打ち上げる間隔(秒)
  volley: 3,           // 1回に打ち上げる数(左上・真上・右上へ1発ずつ)
  launchSpeed: 320,    // 打ち上げる速さ
  wait: 0.7,           // 画面の上へ消えてから、最初の1発が戻ってくるまで(秒)
  waitStep: 0.6,       // 2発目・3発目が戻ってくるまでの遅れ(秒)
  warn: 1.0,           // 戻ってくる何秒前から、画面のふちに予告マーク「!」を出すか
  speed: 115,          // 戻ってきてから自機へ向かう速さ
  turn: 1.6,           // 自機へ向きを変える速さ(ラジアン/秒)
  r: 16,               // 当たり判定の大きさ(半径)。絵の大きさもこれに合わせる
  hp: 16,              // 耐久(主砲のダメージで減る)。終盤の主砲は毎秒8〜44くらい削れる
  dmg: 20,             // 当たったときのダメージ(× 敵の段階のダメージ倍率。終盤は ×2 なので 40)
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
// ---- スタート演出(タイトルでクリック → 小物と自機が奥から順にパタパタ立ち上がる → チュートリアル) ----
// 演出中にもう一度クリック(Enter)すると飛ばせる
const INTRO = {
  enable: true,       // false にすると演出なしですぐ始まる
  titleFade: 0.35,    // タイトルの文字が消えるまでの秒数(そのあと立ち上がり始める)
  step: 0.21,         // 1つ立ち上がってから次が立ち上がり始めるまでの秒数
  pop: 0.43,          // 1つが立ち上がるのにかける秒数
  hold: 0.8,          // 全部立ち上がってからチュートリアルが始まるまでの秒数
};

// ---- クリア演出(10:00 → BGMが消える → 敵が消えていく → スタートと逆の順番でパタパタ倒れる → 結果画面) ----
// 演出中にクリック(Enter)すると飛ばせる。ゲームオーバーのときは演出なしで結果画面へ
const OUTRO = {
  enable: true,       // false にすると演出なしですぐ結果画面
  enemyFade: 1.2,     // 敵が消えていくのにかける秒数(自機の近くから順に)
  propsAt: 1.8,       // 何秒後から倒れ始めるか(BGMが消えるのを待つ)
  step: 0.15,         // 1つ倒れてから次が倒れ始めるまでの秒数
  fall: 0.35,         // 1つが倒れるのにかける秒数
  hold: 1.2,          // 全部倒れてから結果画面になるまでの秒数
};

// ---- ランキング(このブラウザに保存。10分モードと5分モードは別々) ----
const RANKING = {
  size: 10,                 // 何位まで残すか
  nameMax: 8,               // 名前の最大文字数
  defaultName: "ななし",    // 名前を入れなかったときの名前
};

const EVENT = {
  idleToTitle: 30,  // ゲームオーバー/クリア画面で操作がないと、この秒数でタイトルへ戻る(次の人はチュートリアルから)
};

// ---- レベルアップに必要な経験値: base + Lv × perLevel + Lv ^ pow ----
const LEVEL = { base: 5, perLevel: 3, pow: 1.3 };

// ---- カードの枠 ----
const CARD_RULES = { weaponSlots: 4, passiveSlots: 4, maxLevel: 5 };

// ---- ボム ----
const BOMB = {
  start: 1,             // 最初に持っているボムの数
  max: 4,               // 持てるボムの上限
  dmgPerTierHp: 12,     // ダメージ = 12 × その時点の段階のHP倍率
  fullBonus: 1000,      // 上限まで持っているときにボムを取ると、代わりにもらえるスコア(× その時の熱量)
};

// ---- BGM(assets フォルダ) ----
// 遊んでいる間は main、大巨兵が来たら boss に切り替える。タイトル・ゲームオーバー・クリアでは止める
// [M]キーで効果音と一緒に消せる
const BGM = {
  enable: true,                       // false にするとBGMを鳴らさない
  main: "assets/bgm_main.mp3",        // 通常の戦闘曲(0:00〜大巨兵まで)
  boss: "assets/bgm_boss.mp3",        // 大巨兵戦の曲
  volume: 0.1,                       // 音量(0〜1)。効果音より少し小さめ
  pauseVolume: 0.3,                   // ポーズ中・レベルアップ画面の音量(通常の何倍か)
  fadeSec: 1.5,                       // 曲の切り替え・止めるときにかける時間(秒)
  // 大巨兵の登場: 少し前に main を止めて静かにし、咆哮のあと少ししてから boss を流す
  stopBefore: 4,                      // 大巨兵が来る何秒前に main を止め始めるか(fadeSec より長くする)
  bossDelay: 2.5,                     // 咆哮から boss が流れ始めるまでの秒数
};

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
  thunder: { interval: L => 1.8 - 0.15 * L, dmg: L => 1.2 + 0.5 * L, chain: L => 1 + L },   // Lv5で 1.05秒ごと・威力3.7・6体まで連鎖
  nova:    { interval: L => 5 - 0.5 * L, dmg: L => 2 + L, radius: L => 110 + 20 * L, knock: L => 60 + 15 * L },
  slow:    { radius: L => 120 + 20 * L, factor: L => Math.min(0.45, 0.2 + 0.05 * L) },   // Lv5で 半径220・45%減速
  // 標的レーザー: 敵に「標的マーク」を付ける。マークされた敵は全武器から受けるダメージが増え、倒したときのスコアも増える
  marker:  { interval: L => 3.0 - 0.25 * L, marks: L => 1 + L, dmg: L => 0.5 + 0.2 * L, range: 520 },   // Lv5で 1.75秒ごと・6体にマーク
};
const MARK = {
  duration: 6,         // マークが続く秒数
  vuln: 0.25,          // マークされた敵が受けるダメージ +25%
  score: 1.5,          // マークされた敵を倒したときのスコア倍率
};

// ---- 強化の効果(1Lvごと) ----
const PASSIVE = {
  power: 0.20,         // 火力強化: 全武器のダメージ +20%
  rate: 0.85,          // 過給機: 主砲の発射間隔 ×0.85
  rateHeat: 0.012,     //         さらに 熱量が1上がるごとに 発射間隔 -1.2% × Lv(Lv5・熱量×6.0で -30%)
  rateHurt: 0.2,       //         その代わり、被弾で下がる熱量が +0.2 × Lv(Lv5で +1.0)
  caliberSize: 2,      // 大口径弾: 弾の半径 +2
  caliberDmg: 0.15,    //           威力 +15%
  caliberSpeed: 0.10,  //           弾速 -10%
  armorHp: 25,         // 装甲板: 最大HP +25
  armorCut: 0.05,      //         受けるダメージ -5%
};

// ---- 進化(武装Lv5 + 対応する強化Lv5 で、レベルアップ時に候補に出る) ----
const EVOLVE = {
  cluster:   { bomblets: 6, bombletDmg: 0.5, bombletRadius: 38 },   // クラスターミサイル: 子爆弾の数・威力(ミサイル比)・爆発範囲
  aaBattery: { barrels: 3, pops: 4, radiusMul: 1.5, dmgMul: 1.6, intervalMul: 0.75 },   // 高射砲陣地: 砲身の数・1発が爆発する回数・炸裂範囲の倍率・威力倍率・発射間隔倍率
  heavy:     { dmgMul: 3.5, blastRadius: 80, blastDmg: 1.0, knockMul: 2.0, intervalMul: 0.9 },  // 重砲台: 威力倍率・着弾爆発の範囲・爆発の威力(弾比)・押し戻し倍率・発射間隔倍率
  leapMine:  { extraMax: 2, radiusMul: 1.3, airHeight: 150, airReach: 260 },   // 跳躍地雷: 設置数の追加・爆発範囲の倍率・跳び上がって爆発する高さ・反応する上空の高さ
  storm:     { bolts: 3, reach: 520, jump: 220, chainBonus: 1, dmgMul: 1.2, intervalMul: 0.85 },  // 雷嵐: 雷の数・最初に狙える距離・連鎖が飛ぶ距離・連鎖数の追加・威力倍率・発射間隔倍率(雷撃を弱めた分を取り戻す)
  counter:   { radiusMul: 1.25, counterDmgMul: 2, counterKnockMul: 1.5 },      // 反撃衝撃波: 範囲の倍率・被弾したときに出る衝撃波の威力倍率・押し戻し倍率
  bounty:    { score: 2, chain: 2, chainRange: 200, heatMax: 8.0 },          // 賞金稼ぎ: マークした敵のスコア倍率・倒したときにマークが移る数・移る距離・熱量の上限(×6.0を超えた分はスコアだけに効き、敵は強くならない)
  gravity:   { dps: 5, tick: 0.5, slow: 0.75, radiusMul: 1.15, resist: false },  // 重力場: 中の敵への秒間ダメージ(火力強化が掛かる)・ダメージの間隔(秒)・減速率・範囲の倍率・下の「効きにくさ」を掛けるか
};
// ---- 減速の効きにくさ(減速フィールドに掛かる。重力場は gravity.resist が true のときだけ) ----
const SLOW_RESIST = {
  perHeat: 0.08,            // 熱量が1上がるごとに、減速の効き目がこれだけ弱まる(×6.0で効き目6割)
  boss: 0.3,                // 巨兵・大巨兵に効く割合
  brute: 0.6,               // 重装兵に効く割合
};
const EVOLUTIONS = [
  { id: "cluster",   from: "missile", with: "boom",    name: "クラスターミサイル", desc: "着弾すると子爆弾をばらまき、周りを巻き込む" },
  { id: "aaBattery", from: "flak",    with: "pierce",  name: "高射砲陣地",         desc: "砲身が3本に。炸裂弾が敵を貫き、何度も爆発する" },
  { id: "heavy",     from: "ground",  with: "caliber", name: "重砲台",             desc: "一撃が重くなり、着弾点が爆発する" },
  { id: "leapMine",  from: "mine",    with: "bounce",  name: "跳躍地雷",           desc: "上空の敵にも反応し、跳び上がって地上と空中で2回爆発する" },
  { id: "storm",     from: "thunder", with: "spread",  name: "雷嵐",               desc: "雷が3本に分かれて別々の敵に落ち、遠くまで連鎖する" },
  { id: "counter",   from: "nova",    with: "armor",   name: "反撃衝撃波",         desc: "範囲が広がり、被弾した瞬間に強力な衝撃波で反撃する" },
  { id: "gravity",   from: "slow",    with: "power",   name: "重力場",             desc: "フィールドの中の敵を強く減速させ、押しつぶしてダメージを与える" },
  { id: "bounty",    from: "marker",  with: "rate",    name: "賞金稼ぎ",           desc: "マークした敵を倒すと近くへ連鎖し、スコア×2。熱量の上限が×8.0に上がる" },
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
  { id: "marker",  type: "weapon", name: "標的レーザー", desc: () => `敵に標的マーク。全武器のダメージ+${MARK.vuln * 100}%、倒すとスコア×${MARK.score}`, up: "マークの数・間隔アップ" },
  // ---- 強化(4枠) ----
  { id: "power",   type: "passive", name: "火力強化", desc: () => `全武器のダメージ +${PASSIVE.power * 100}%` },
  { id: "rate",    type: "passive", name: "過給機",   desc: () => `主砲の発射間隔 -${Math.round((1 - PASSIVE.rate) * 100)}%。熱量が高いほどさらに速い。ただし被弾で熱量が多く下がる` },
  { id: "spread",  type: "passive", name: "拡散砲身", desc: () => "主砲の弾 +1(扇状に広がる)" },
  { id: "pierce",  type: "passive", name: "貫通弾芯", desc: () => "主砲の弾が敵を +1体 貫通" },
  { id: "caliber", type: "passive", name: "大口径弾", desc: () => `主砲の弾が大きくなり威力 +${PASSIVE.caliberDmg * 100}%、弾速 -${PASSIVE.caliberSpeed * 100}%` },
  { id: "boom",    type: "passive", name: "爆裂弾頭", desc: () => "主砲の弾が命中時に爆発(Lvで範囲拡大)" },
  { id: "bounce",  type: "passive", name: "跳弾",     desc: () => "主砲の弾が画面端や地面で +1回 跳ね返る" },
  { id: "armor",   type: "passive", name: "装甲板",   desc: () => `最大HP +${PASSIVE.armorHp}、受けるダメージ -${PASSIVE.armorCut * 100}%` },
  // ---- 補充(上限なし。候補が足りないときやHPが減ったときに出る) ----
  { id: "heal",    type: "filler", name: "緊急修理", desc: () => "HPを30%回復" },
  { id: "bombup",  type: "filler", name: "ボム補充", desc: () => "ボムのストック +1" },   // 今は候補に出さない(ボムは最初の1個とドロップだけ)
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
  titan:   { name: "大巨兵",   hp: 320, speed: 10,  r: 60, color: "#b71c1c", dmg: 25, xp: 100, kind: "ground", from: 99999, boss: true },
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

// ---- 紙風の表示(ペーパーマリオ風) ----
// ゲーム中に G キーでも切り替えられます
const PAPER = {
  enabled: true,                              // false にすると従来の表示
  border: 3,                                  // 白いフチの太さ(画面上px)
  borderColor: "#ffffff",
  shadow: { dx: 4, dy: 4, alpha: 0.35 },      // 紙の影(右下にずらす量と濃さ)
  hop: { height: 6, speed: 9 },               // 地上の敵が歩くときに跳ねる高さ(px)と速さ
  fallTime: 0.45,                             // 撃破されて倒れきるまでの秒数
};

// ---- 砲台の画像(assets フォルダ) ----
// 画像が見つからないときは、これまでの図形で描きます
const TURRET_ART = {
  ground: { src: "assets/turret_ground.png", width: 60, height: 33,   // 地上砲台の表示サイズ(px)。画像は右向きで描く(左側の砲台は左右反転して使う)
            offset: 50,                                             // 自機の中心から砲台の内側の端までの距離
            muzzleY: 0.535 },                                       // 砲口の高さ(画像の上端から何割)
  flak:   { src: "assets/turret_flak.png", width: 44, height: 50,     // 対空砲台の表示サイズ(px)
            muzzleX: 0.6, muzzleY: 0.04,                            // 砲口の位置(画像の左上から何割)
            positions: [150, -150, 206] },  // 自機の中心からの距離。1つ目が通常、2・3つ目は高射砲陣地で追加。マイナスは左側(左右反転して描く)
  evolvedScale: 1.2,          // 進化した砲台の大きさの倍率
  evolvedBorder: "#ffd740",   // 進化した砲台のフチの色(紙風のとき)
};

// ---- 敵の画像(assets フォルダ) ----
// 画像を登録した敵だけが絵になる。登録していない敵はこれまでの図形のまま
// height: 画面上の高さ(幅は画像の縦横比から自動) / hitR: 当たり判定の半径
const ENEMY_ART = {
  grunt:   { src: "assets/enemy_grunt.png",   height: 62,  hitR: 22 },   // 歩兵: ゼンマイ歩行ロボ 44 16
  runner:  { src: "assets/enemy_runner.png",  height: 56,  hitR: 20 },   // 突撃兵: 一輪車ロボ
  brute:   { src: "assets/enemy_brute.png",   height: 84,  hitR: 36 },   // 重装兵: 重装ブリキロボ
  bat:     { src: "assets/enemy_bat.png",     height: 36,  hitR: 17 },   // 左右から飛ぶ: プロペラドローン
  diver:   { src: "assets/enemy_diver.png",   height: 70,  hitR: 25 },   // 上から降る: パラシュートロボ
  spitter: { src: "assets/enemy_spitter.png", height: 72,  hitR: 25 },   // 浮いて撃つ: 小型飛行船
  boss:    { src: "assets/enemy_boss.png",    height: 154, hitR: 63 },   // 巨兵: 巨大ブリキロボ
  titan:   { src: "assets/enemy_titan.png",   height: 210, hitR: 91 },   // 大巨兵: 要塞ロボ
  dummy:   { src: "assets/enemy_dummy.png",   height: 56,  hitR: 25 },   // チュートリアルの的: 射的の的
};
// 被弾したときに白く光る。巨兵・大巨兵は攻撃が集中して光りっぱなしになるので、うすく・間をあけて光らせる
const HIT_FLASH = {
  time: 0.08,                                          // 雑魚: 真っ白に光る時間(秒)
  boss: { alpha: 0.35, time: 0.06, gap: 0.25, squash: 0.03 },   // ボス: 白の濃さ・光る時間・次に光るまでの間・つぶれ具合
};
const ENEMY_TINT = 0.45;   // 上位種の色を絵に重ねる濃さ(0〜1)

// ---- 背景の画像 ----
// 読み込み時に一度だけ、ぼかし・明るさ・彩度を調整して使う
const BG_ART = {
  // 中層(本棚やおもちゃ)。前のパターンに戻すときは src を "assets/bg_middle_flat.png"、spread と sinkY を 0 にする
  middle: { src: "assets/bg_middle.png", blur: 2.5, brightness: 0.42, saturate: 0.8,
            scale: 1,          // 大きさ(1 = 画面の横幅いっぱい)
            spread: 80,        // 画像を左右半分に分けて、それぞれ外側へずらす距離(px)。中央の自機まわりを空ける
            sinkY: 30,         // 画像の下端を地面の線より何px下に沈めるか(手前の床に隠れる分)
            floorShade: 0.45,  // 地面近く(敵が歩く高さ)を暗くする強さ(0〜1)
            centerShade: 0.35, // 中央(自機のまわり)を暗くする強さ(0〜1)
  },
};

// ---- 背景: 子ども部屋のジオラマ(案A+C) ----
// 壁・床・小物を読み込み時に1枚へ焼き付ける(遊んでいる最中は貼るだけなので軽い)
// 段階が上がるごとに、窓の外の空と部屋の明るさが 昼 → 夕方 → 夕暮れ → 夜 と変わる
const BG_ROOM = {
  enable: true,             // false にすると前の1枚絵(BG_ART.middle)に戻る
  blur: 1.2,                // 背景全体のぼかし(px)。敵を目立たせるため
  saturate: 0.85,           // 背景全体の彩度
  wall:  { src: "assets/bg_wall.png", height: 320 },   // 壁と窓。左右反転してつなぎ、窓を左右2つにする
  floor: { src: "assets/bg_floor.png",
           top: 316,        // 床の奥(壁との境目)の高さ
           plank: 0.42,     // 板の大きさ(奥での倍率)
           vanishY: -420,   // 消失点の高さ。小さい(上)ほど遠近感が弱くなる
           wallShadow: 0.45 },  // 壁ぎわの床の影の濃さ
  // 小物。x: 中心の横位置 / y: 床に接する高さ(大きいほど手前) / h: 画面上の高さ / flip: 左右反転
  props: [
    { src: "assets/bg_tower.png",     x: 120, y: 340, h: 150 },
    { src: "assets/bg_bookshelf.png", x: 330, y: 334, h: 205 },
    { src: "assets/bg_toybox.png",    x: 612, y: 338, h: 84 },
    { src: "assets/bg_globe.png",     x: 600, y: 268, h: 80, noShadow: true },   // おもちゃ箱の上に乗せる
    { src: "assets/bg_rabbit.png",    x: 850, y: 342, h: 100 },
    { src: "assets/bg_bear.png",      x: 455, y: 350, h: 84 },
    { src: "assets/bg_blocks.png",    x: 215, y: 388, h: 66 },
    { src: "assets/bg_ball.png",      x: 735, y: 392, h: 46 },
    { src: "assets/bg_train.png",     x: 540, y: 402, h: 46, flip: true },
  ],
  // 手前の積み木(画像の左半分を左下、右半分を右下に置く)。自機や敵より手前に描いて奥行きを出す
  front: { enable: true,    // 始めから表示するか。遊んでいる最中も[F]キーで切り替えられる
           src: "assets/bg_front.png", h: 270, sinkY: 55, blur: 3, alpha: 0.85 },
  // 段階ごとの空と明るさ(第1段階〜第4段階)。sky: 窓の外の空(上, 下) / bright: 部屋の明るさ / tint: 部屋にかける色
  tiers: [
    { sky: ["#5fb4ee", "#cdeeff"], bright: 0.55, tint: "rgba(255,240,210,0.00)", stars: false },   // 昼
    { sky: ["#f08a4b", "#ffd28a"], bright: 0.50, tint: "rgba(255,140,60,0.12)",  stars: false },   // 夕方
    { sky: ["#3b2a6b", "#c0607a"], bright: 0.42, tint: "rgba(120,60,160,0.16)",  stars: true  },   // 夕暮れ
    { sky: ["#0a0f2a", "#1d2a5a"], bright: 0.34, tint: "rgba(40,60,140,0.22)",   stars: true  },   // 夜
  ],
  fadeSec: 3,               // 段階が変わったときに切り替わる秒数
};

// ---- 熱量(うまく戦うほど敵が増え、スコアの倍率も上がる) ----
// 今の難しさが下限(×1.0)。敵を素早く倒すと上がり、被弾したり囲まれたりすると下がる
// 1体あたりの上がる量は「そのときの出現ペース」で割るので、敵が多い終盤でも上がる速さは変わらない
// (出てくる敵をすべて素早く倒し続けると、1秒あたり gainPerSec × fastBonus 上がる)
const HEAT = {
  min: 1.0, max: 6.0,       // 熱量の範囲
  gainPerSec: 0.02,         // 出てくる敵をすべて倒し続けたときに、1秒あたり上がる量
  fastKillTime: 4,          // 出現からこの秒数以内に倒すと「素早い撃破」
  fastBonus: 1.5,           // 素早い撃破では上がる量がこの倍(すべて素早く倒し続けると、×1.0→×6.0 までおよそ3分)
  decayPerSec: 0.003,       // 何もしなくても少しずつ下がる量(1秒あたり)
  hurtDrop: 2.0,            // 被弾したときに下がる量
  crowdRadius: 170,         // 自機からこの距離以内に…
  crowdCount: 8,            // …この数以上の敵がいると「囲まれている」
  crowdDropPerSec: 0.2,     // 囲まれているあいだ下がる量(1秒あたり)
  spawnBoost: 0.3,          // 熱量が1上がるごとに、敵の出現がこれだけ速くなる(×6.0で出現の速さ2.5倍)
  hpBoost: 0.15,            // 熱量が1上がるごとに、新しく出る敵のHPがこれだけ増える(×6.0でHP1.75倍)
  titanHpBoost: 0.25,       // 大巨兵だけはこちらを使う(×6.0でHP2.25倍)。10:00までの残り1分で倒せるように弱めにしてある
  bombDrop: 1.0,            // ボムを使うと下がる量(ボムで倒した敵では熱量は上がらない)
};

// ---- スコア ----
// 敵を倒した点数 = 敵の経験値 × 段階の点数倍率(TIERS の score) × perXp × その時の熱量
const SCORE = {
  perXp: 100,               // 経験値1あたりの点数
  bossBonus: 2000,          // 巨兵を倒したときの追加点(×熱量)
  titanBonus: 150000,       // 大巨兵を倒したときの追加点(×熱量)。熱量×3なら45万点、×6なら90万点(標的マークの倍率は掛からない)
  clearBonus: 5000,         // クリアしたときの追加点
  hpBonus: 50,              // クリア時に残ったHP 1あたりの追加点
  noBombBonus: 200000,      // ボムを1回も使わずにクリアしたときの追加点(× 最高熱量)。熱量×3なら60万点、×6なら120万点
};

// ---- 処理の重さ対策 ----
const PERF = {
  maxEnemies: 120,       // 画面に同時に出る敵の上限(これを超える分は出現しない)
  maxParticles: 300,     // 破片の上限
  maxCorpses: 60,        // 倒れる動きを同時に見せる上限(超えた分はすぐ消える)
  spriteQuality: 1.5,    // 敵の画像を、表示サイズの何倍の細かさで用意しておくか(大きいほどきれいで重い)
  soundGapMs: 45,        // 同じ効果音を続けて鳴らすときの最短の間隔(ミリ秒)
};

// ---- ビルドが完成した後のレベルアップ ----
// 取れるカードが無くなったら、選択画面を出さずに自動で受け取る
const LEVEL_BONUS = {
  score: 1500,           // スコア(× その時の熱量)
  heal: 10,              // HP回復
};
