# vision — ArUco 物体検出（位置トラッキング）

天井カメラ（本番: Logicool BRIO / 開発: ノートPCカメラ）で5台のスーツケース上の
ArUco マーカーを検出し、位置を中央サーバーへ渡して衝突回避に使う。

> 設計思想：カメラの差し替えは `config.py` の編集だけで済むようにする。
> 検出ロジック(`detect.py`)・マーカー生成(`generate_markers.py`)はカメラに依存しない。

## 進め方（段階）

- **Step 1（今ここ）**：マーカー生成 ＋ カメラで検出 ＋ 画面/端末に位置表示
- Step 2：画像内位置 → 部屋の実座標(m) への変換（ホモグラフィ）
- Step 3：位置を UDP で中央サーバーへ送信 → `server/position` を mock から差し替え
- Step 4（本番）：BRIO を天井設置 → キャリブ＆床座標を取り直し（`config.py` 差し替え）

## セットアップ（Mac）

```bash
cd vision
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 使い方

### 1) マーカーを作って印刷
```bash
python generate_markers.py
```
- `markers/sheet_A4.png` を **100%（実寸）で1枚印刷**すれば、ID 1〜5 が机テスト用に揃う。
- 印刷後、マーカーの一辺を定規で測り、`config.py` の `MARKER_LENGTH_MM` を実測値に。

### 2) カメラ番号を確認
```bash
python detect.py --list
```
出た番号を `config.py` の `CAMERA_INDEX` に設定（ノートPC内蔵は通常 0）。
※ macOS は初回にカメラ使用許可のダイアログが出る。

### 3) 検出する
```bash
python detect.py
```
- 印刷したマーカーをカメラに映すと、緑枠＋ID＋座標が表示される。`q` で終了。
- カメラが無い/確認だけしたいときは静止画でも試せる：
  ```bash
  python detect.py --image markers/marker_1.png
  ```

## 出力する位置の意味
- `px` … 画像内のピクセル座標（左上原点）
- `norm` … 0〜1 に正規化（カメラ解像度に依らない）
- `yaw` … マーカーの向き（おおまかな角度）

「部屋の実座標(m)」への変換は Step 2 で行う（今は画像内の位置まで）。

## 本番カメラ（BRIO）への差し替え
1. BRIO を USB 接続（UVC 準拠＝ドライバ不要・プラグ＆プレイ）
2. `python detect.py --list` で番号確認 → `config.py` の `CAMERA_INDEX` を変更
3. （精度を出すなら）BRIO 用にキャリブして `CALIBRATION_FILE` を差し替え
4. 天井設置後、床座標の対応（ホモグラフィ）を取り直す ← Step 2 の成果物を再取得

→ **`detect.py` は触らない。** 設定ファイルの入れ替えだけで移行できる。
