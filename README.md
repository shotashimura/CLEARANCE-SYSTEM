# CLEARANCE SYSTEM

《Nothing to Declare》の制御系ソフトウェア。

OpenSky API から取得した実便を 5 台のスーツケース（M5Stack CoreS3 搭載）に
1 便ずつ割り当て、3 エージェント（SECURITY / FLOW / CARE）の LLM 判定を
運動パラメータに変換し、衝突回避の補正を掛けたうえで UDP/OSC で各機体へ送る。
状態は WebSocket でフロント各ページに配信される。

全体設計は [ARCHITECTURE.md](ARCHITECTURE.md) を参照（単一の参照点）。

```
OpenSky API ──▶ 中央サーバー (Node) ──UDP/OSC──▶ M5Stack ×5（スーツケース）
天井カメラ ──▶   判定・翻訳・衝突回避     │
（ArUco 検出）                          └─WebSocket──▶ /board /cycle /suitcase/:id
```

## ディレクトリ構成

| ディレクトリ | 内容 |
|---|---|
| `server/` | 中央サーバー（Node）。便取得・判定・OSC送信・衝突回避・WebSocket 配信 |
| `src/` | フロント（React + Vite）。中央サーバーの状態を購読して表示するだけ |
| `src/config/fleet.js` | 対応表（suitcaseId ↔ 便スロット ↔ OSC ↔ M5Stack）。**単一の真実** |
| `firmware/` | M5Stack CoreS3 のスケッチと配線設計 → [firmware/README.md](firmware/README.md) / [firmware/WIRING.md](firmware/WIRING.md) |
| `vision/` | ArUco 物体検出（位置トラッキング・Python）→ [vision/README.md](vision/README.md) |

## セットアップ

```bash
npm install
```

プロジェクト直下に `.env` を作成（`.gitignore` 済み）:

```bash
OPENAI_API_KEY=sk-...   # 3エージェント判定に使用
```

## 起動

```bash
npm run dev   # クライアント(Vite) と 中央サーバー(Node) を同時起動
```

- 中央サーバー: `http://localhost:8787`（WebSocket + OSC 送信ループ）
- フロント: Vite の表示する URL（通常 `http://localhost:5173`）

| ページ | 用途 |
|---|---|
| `/` | 単発判定（開発用） |
| `/board` | DepartureBoard・全体俯瞰（オペレーター/会場用） |
| `/cycle` | 運用監視 |
| `/suitcase/:id` | 1 台分の判定結果のみ表示（各スーツケース内 iPad 想定） |

## 主な環境変数

| 変数 | 既定値 | 意味 |
|---|---|---|
| `OPENAI_API_KEY` | （必須） | エージェント判定の API キー |
| `CLEARANCE_PORT` | `8787` | 中央サーバーのポート |
| `CLEARANCE_POSITION` | `mock` | 位置 provider。`aruco` で vision からの UDP 受信に切替 |
| `CLEARANCE_POSITION_PORT` | `8788` | `aruco` 時の位置受信 UDP ポート |
| `CLEARANCE_AGENT_MODEL` | `gpt-4o-mini` | 判定に使うモデル |
| `CLEARANCE_JUDGE_INTERVAL_MS` | `60000` | 1 台あたりの判定間隔 |
| `CLEARANCE_MOTION_GAP_MS` | `500` | OSC 送信（motionLoop）の間隔 |

## 関連ツール

```bash
node server/tools/oscSend.js <IP> <port> <suitcaseId>   # M5Stack へ単体で OSC テスト送信
```
