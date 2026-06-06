# CLEARANCE SYSTEM — アーキテクチャ

《Nothing to Declare》の制御系ソフトウェア全体構成。
本ドキュメントは「対応関係が破綻しない」ことを保証するための設計の単一の参照点。

---

## 0. 全体像（中央サーバー方式）

```
                        ┌──────────────────────────────────────────────┐
 OpenSky API ──────────▶│  中央サーバー (Node)  =  CLEARANCE SYSTEM      │
                        │                                              │
 天井カメラ(将来)        │  ① flight assigner : 5便取得・1便1台に固定割当  │
   │ ArUco/OpenCV        │  ② deliberation     : 3エージェント判定→verdict │──UDP/OSC──▶ M5Stack #1
   │ (server側)          │  ③ translate        : verdict→運動パラメータ     │──UDP/OSC──▶ M5Stack #2
   └─position provider──▶│  ④ collision        : 位置→衝突予測→OSC補正     │──UDP/OSC──▶ ...
       (今は mock)        │  ⑤ broadcast        : 状態を WebSocket で配信   │──UDP/OSC──▶ M5Stack #5
                        └───────────────┬──────────────────────────────┘
                                        │ WebSocket（状態購読・読み取り専用）
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼               ▼               ▼               ▼               ▼
   /suitcase/1     /suitcase/2     /suitcase/3     /suitcase/4     /suitcase/5
   （各スーツケース内 iPad : 自分の 1 台分の判定結果のみ表示）

                        ▼ （オペレーター/会場用）
                   /board（DepartureBoard・全体俯瞰）   /cycle（運用監視）
```

中央サーバーが唯一の状態源（single source of truth）。
フロントの各ページは状態を**購読して表示するだけ**で、判定もOSC送信も行わない。

---

## 1. 対応表（破綻させない不変条件）

定義場所：[`src/config/fleet.js`](src/config/fleet.js)（フロント・サーバー双方が import）

| suitcaseId | 個体 (中身) | 便スロット | 個別ページ | OSCアドレス | M5Stack |
|:--:|---|---|---|---|---|
| 1 | TOURIST (普通の旅行物) | east_asia | `/suitcase/1` | `/suitcase/1/*` | M5-01 `192.168.10.11:8000` |
| 2 | DATA CARRIER (データ媒体) | europe | `/suitcase/2` | `/suitcase/2/*` | M5-02 `192.168.10.12:8000` |
| 3 | SUSPECT (レプリカ禁制品) | middle_east | `/suitcase/3` | `/suitcase/3/*` | M5-03 `192.168.10.13:8000` |
| 4 | GHOST (物語の断片) | north_america | `/suitcase/4` | `/suitcase/4/*` | M5-04 `192.168.10.14:8000` |
| 5 | EMPTY (移動の痕跡のみ) | oceania | `/suitcase/5` | `/suitcase/5/*` | M5-05 `192.168.10.15:8000` |

**不変条件**
- 1 suitcase = 1 flight（固定）。便が到着・欠航したら中央サーバーが同地域の次候補便を再割当（suitcaseId と OSC/M5Stack の対応は不変、便だけ差し替わる）。
- OSCアドレスは `/suitcase/{id}/{param}` 名前空間で衝突しない。
- M5Stack は suitcaseId と 1:1。host:port は LAN 静的割当。

---

## 2. データフロー① 判定 → OSC値

```
flight(便) ──▶ deliberateOne(flight)
                 ├ SECURITY / FLOW / CARE 並列判定
                 └ ORCHESTRATOR 集約 ──▶ verdict.final_judgment
                                          { permission, risk_score, decisiveness,
                                            speed_factor, direction,
                                            duration_seconds, behavior_modifier }
                                              │
              translateJudgment(verdict, individual)  ← individual = fleet[id]
                 final_speed = PERMISSION_SPEED_MAP[permission]
                                * speed_factor * base_speed
                 jitter      = (risk_score / 100) * 0.15
                 hesitation  = (1 - decisiveness) * 3.0
                                              │
                                              ▼
                          baseOsc[suitcaseId] = { speed, direction,
                            duration, behavior, jitter, hesitation, steering_bias }
```

定義：[`src/lib/translateJudgment.js`](src/lib/translateJudgment.js)（純粋関数。フロント・サーバー共用）

---

## 3. データフロー② 物体検出 → 衝突回避 → OSC補正

```
天井カメラ映像 ─(将来)─▶ OpenCV + ArUco 検出 ─▶ positions[suitcaseId] = {x, y, heading, ts}
                                                          │
   ※ 現段階は position provider が mock 値を供給          │
                                                          ▼
                       collisionAvoidance(baseOsc[], positions[])
                          ・壁/什器への接近を予測
                          ・スーツケース同士の接近を予測
                          ・接近時は base の speed/direction を補正
                            （減速・停止・後退・迂回）
                                                          │
                                                          ▼
                          correctedOsc[suitcaseId]  ──▶ OSC送信(④)
```

- 補正は**サーバー側で完結**。M5Stack はカメラ・画像認識を持たず、補正後のOSCを受信して動くだけ（企画書 9 ページ準拠）。
- position provider はインターフェース化し、`mock` → 後で `aruco`(実カメラ) に差し替え可能にする。

定義（予定）：`server/collision.js` / `server/position/`（mock provider）

---

## 4. データフロー③ OSC実送信 → M5Stack

```
correctedOsc[suitcaseId]
   └─ fleet[id].oscAddressBase + param 名 で OSC メッセージ生成
       例: /suitcase/3/speed 0.20
           /suitcase/3/direction -1.0
           /suitcase/3/behavior "hesitant"
   └─ fleet[id].m5stack.host:port へ UDP 送信（osc ライブラリ）
```

定義（予定）：`server/osc.js`（Node の osc/dgram で実 UDP 送信）

---

## 5. データフロー④ 状態配信 → 各スーツケース個別ページ

```
中央サーバー state = {
  suitcases: {
    1: { flight, verdict, osc, position, collision },
    2: { ... }, ... 5
  },
  announcement, cycle, ...
}
   └─ WebSocket で全状態を push（または差分）
       ├ /suitcase/1 は state.suitcases[1] だけ取り出して表示
       ├ /suitcase/2 は state.suitcases[2] だけ…
       └ /board は全 suitcase + history + announcement を表示
```

- 各 `/suitcase/:id` は**自分の1台分しか描画しない**（iPad 内蔵想定）。
- 判定理由・risk_score は観客非表示の禁則を維持（個別ページにも出さない）。

定義（予定）：`server/index.js`（WebSocket）/ `src/pages/SuitcaseView.jsx` / `src/lib/clearanceClient.js`

---

## 6. 実装スコープ（本支援期間 / プロトタイプ段階）

| 項目 | 本実装 | 備考 |
|---|---|---|
| 対応表 (fleet) | ✅ 実装 | 単一の真実 |
| 中央サーバー + WebSocket配信 | ✅ 実装 | |
| 判定 → OSC変換 | ✅ 実装（既存流用） | |
| OSC実UDP送信 | ✅ 実装 | M5Stack 未接続でも送信は走る（受け手不在でも可） |
| 衝突回避ロジック | ✅ 実装 | 入力(位置)は mock provider |
| 物体検出 (ArUco/OpenCV) | ⛔ 後日 | position provider を差し替えるだけにしておく |
| 個別ページ /suitcase/:id | ✅ 実装 | 1台分のみ表示 |

---

## 7. ディレクトリ構成（予定）

```
CLEARANCE-SYSTEM/
├── server/                     ← 中央サーバー (Node)
│   ├── index.js                ← 起動・サイクルループ・WebSocket
│   ├── deliberation.js         ← サーバー側 3エージェント判定（process.env キー）
│   ├── flights.js              ← OpenSky 取得（サーバー側・CORS不要）
│   ├── collision.js            ← 衝突回避（位置→OSC補正）
│   ├── osc.js                  ← OSC 実 UDP 送信
│   └── position/
│       └── mockProvider.js     ← 位置 mock（後で aruco provider に差替）
├── src/
│   ├── config/fleet.js         ← 対応表（単一の真実・フロント/サーバー共用）
│   ├── lib/
│   │   ├── translateJudgment.js ← 判定→OSC変換（純粋・共用）
│   │   ├── clearanceClient.js   ← WebSocket 購読クライアント（フロント）
│   │   └── ...
│   └── pages/
│       ├── SuitcaseView.jsx     ← /suitcase/:id（1台分のみ）
│       ├── BoardView.jsx        ← /board（中央サーバー購読に寄せる）
│       ├── CycleView.jsx        ← /cycle（運用監視）
│       └── SingleView.jsx       ← / （単発判定・開発用）
└── ARCHITECTURE.md             ← 本書
```
