# M5Stack CoreS3 — OSC 受信テスト手順

中央サーバー / テスト送信スクリプトから飛ばす OSC を CoreS3 で受信し、
画面に表示するところまでを確認する。**この段階ではモーターは動かさない**
（まず「バイトが届く」ことを確実にする）。

```
[PC] server/tools/oscSend.js  ──UDP/OSC──▶  [CoreS3] 画面に speed/dir/... を表示
   または中央サーバー (npm run dev)
```

---

## 1. Arduino IDE の準備

1. **ボードマネージャ**: Arduino IDE → 設定 → 追加のボードマネージャURL に
   `https://static-cdn.m5stack.com/resource/arduino/package_m5stack_index.json` を追加。
   ボードマネージャで **M5Stack** をインストール。
2. **ボード選択**: ツール → ボード → M5Stack → **M5CoreS3**。
3. **ライブラリ**（ライブラリマネージャからインストール）:
   - `M5Unified`
   - `OSC`（作者: Adrian Freed, Yotam Mann。"OSC" で検索して出る CNMAT 製）

## 2. スケッチの設定

`firmware/clearance_receiver/clearance_receiver.ino` を開き、先頭を編集:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_SSID";      // WiFi 名
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";  // パスワード
const int   SUITCASE_ID = 1;                   // この機体の番号 (1..5)
const uint16_t OSC_PORT = 8000;                // 既定 8000（変えなくてよい）
```

> PC と CoreS3 は **同じ WiFi** に繋ぐこと（ルーターのクライアント分離が
> 有効だと届かないので注意）。

## 3. 書き込み & IP の確認

1. CoreS3 を USB-C で接続し、ツール → ポートを選択して書き込み。
2. 起動すると画面に **自分の IP アドレス**が出る（例: `IP 192.168.10.42 : 8000`）。
   この IP を次で使う。`link ----` は「まだ受信なし」、緑の `link LIVE` が受信中。

## 4. テスト送信（PC 側）

中央サーバーを起動せず、単体でこの 1 台へ OSC を送る:

```bash
cd /Users/shimurashouta/Desktop/CLEARANCE-SYSTEM
node server/tools/oscSend.js 192.168.10.42 8000 1
#                            ^IP(M5画面の値)  ^port ^SUITCASE_ID と一致させる
```

0.5 秒ごとに speed / direction / steering / behavior が変化して送られる。
CoreS3 の画面で `speed` などの数値が動き、`link LIVE` になれば **成功**。

`Ctrl+C` で送信停止。

## 5.（任意）中央サーバー経由で送る

実運用の経路（OpenSky→判定→OSC）でも届くか試す場合:

1. `src/config/fleet.js` の `suitcaseId:1` の `m5stack.host` を
   CoreS3 の実 IP に書き換える（例 `"192.168.10.42"`）。
2. `npm run dev` を起動。中央サーバーが motionLoop（~0.5s）ごとに補正後 OSC を
   その IP へ送るので、CoreS3 が反応する。

---

## トラブルシュート

| 症状 | 対処 |
|---|---|
| `link ----` のまま | PC と M5 が同じ WiFi か / IP・ポート・SUITCASE_ID が一致しているか確認 |
| WiFi FAILED（赤画面） | SSID/パスワード、2.4GHz 帯かを確認（CoreS3 は 2.4GHz のみ） |
| 値が一部しか出ない | 送信側 SUITCASE_ID とスケッチの `SUITCASE_ID` を一致させる |
| ファイアウォール | PC 側のファイアウォールが UDP 送信をブロックしていないか |

## 次のステップ（モーター）

受信が安定したら、`.ino` 末尾のコメント雛形（`applyMotion()` / `motionSetup()`）を
有効化し、ESC・ステアリングサーボの GPIO ピンを設定して PWM 駆動に進む。
配線（ピン番号）が決まったら教えてください。
