#!/usr/bin/env python3
# ArUco マーカー検出（Step 1: 検出して画面と端末に位置を出すだけ）。
#
# 使い方:
#   python detect.py                 # カメラ(config.CAMERA_INDEX)で検出。q で終了
#   python detect.py --image foo.png # 静止画で検出（カメラ無しの動作確認用）
#   python detect.py --list          # 使えそうなカメラ番号を探す
#
# 出力する位置:
#   px   = 画像内のピクセル座標（左上原点）
#   norm = 0..1 に正規化した座標（カメラ解像度に依らない）
#   yaw  = マーカーの向き（おおまかな角度・度）
#
# ※「画像内の位置 → 部屋の実座標(m)」への変換は Step 2（ホモグラフィ）で行う。
#   ここでは検出と画面内位置までを確認する。
import argparse
import time
import sys

import cv2
import numpy as np

import config
from aruco_compat import get_dictionary, make_detect_fn


def detect_markers(frame, detect_fn):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    corners, ids, _ = detect_fn(gray)
    h, w = frame.shape[:2]
    results = []
    if ids is not None and len(ids) > 0:
        cv2.aruco.drawDetectedMarkers(frame, corners, ids)
        for c, mid in zip(corners, ids.flatten()):
            pts = c.reshape(4, 2)
            cx, cy = pts.mean(axis=0)
            nx, ny = cx / w, cy / h
            top = pts[1] - pts[0]  # 上辺ベクトル → おおまかな向き
            yaw = float(np.degrees(np.arctan2(top[1], top[0])))
            results.append(
                {
                    "id": int(mid),
                    "px": (round(float(cx), 1), round(float(cy), 1)),
                    "norm": (round(float(nx), 3), round(float(ny), 3)),
                    "yaw_deg": round(yaw, 1),
                }
            )
            cv2.circle(frame, (int(cx), int(cy)), 4, (0, 0, 255), -1)
            cv2.putText(
                frame,
                f"#{int(mid)} ({nx:.2f},{ny:.2f})",
                (int(cx) + 6, int(cy) - 6),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 255, 0),
                1,
                cv2.LINE_AA,
            )
    return results


def list_cameras(max_index=5):
    print("使えそうなカメラ番号を探索中...")
    found = []
    for i in range(max_index):
        cap = cv2.VideoCapture(i)
        ok = cap.isOpened()
        if ok:
            ret, _ = cap.read()
            if ret:
                found.append(i)
                print(f"  index {i}: OK")
        cap.release()
    if not found:
        print("  カメラが見つかりませんでした（権限・接続を確認）")
    else:
        print(f"使えるカメラ: {found} → config.py の CAMERA_INDEX に設定")
    return found


def run_image(path):
    frame = cv2.imread(path)
    if frame is None:
        print(f"画像を読めません: {path}", file=sys.stderr)
        sys.exit(1)
    dictionary = get_dictionary(config.ARUCO_DICT)
    detect_fn = make_detect_fn(dictionary)
    results = detect_markers(frame, detect_fn)
    print(f"検出 {len(results)} 個:")
    for r in results:
        print(f"  ID={r['id']:>2}  norm={r['norm']}  yaw={r['yaw_deg']}deg")
    out = path.rsplit(".", 1)[0] + "_detected.png"
    cv2.imwrite(out, frame)
    print(f"検出結果を描画して保存: {out}")
    return results


def run_camera():
    dictionary = get_dictionary(config.ARUCO_DICT)
    detect_fn = make_detect_fn(dictionary)

    cap = cv2.VideoCapture(config.CAMERA_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.FRAME_HEIGHT)
    if not cap.isOpened():
        print(
            f"カメラ {config.CAMERA_INDEX} を開けません。"
            "`python detect.py --list` で番号を確認してください。",
            file=sys.stderr,
        )
        sys.exit(1)

    print("検出開始。ウィンドウを選択して q で終了。")
    last = time.time()
    fps = 0.0
    while True:
        ret, frame = cap.read()
        if not ret:
            print("フレーム取得失敗", file=sys.stderr)
            break
        results = detect_markers(frame, detect_fn)

        now = time.time()
        dt = now - last
        last = now
        if dt > 0:
            fps = 0.9 * fps + 0.1 * (1.0 / dt)
        cv2.putText(
            frame,
            f"{len(results)} markers  {fps:4.1f} fps  (q=quit)",
            (10, 26),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 255),
            2,
            cv2.LINE_AA,
        )

        # 端末にも軽く出す（毎フレームは多いので検出時のみ）
        if results:
            ids = ",".join(str(r["id"]) for r in results)
            print(f"\rIDs: {ids:<20} ({len(results)})", end="", flush=True)

        cv2.imshow("CLEARANCE ArUco detect (Step1)", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    print("\n終了。")


def main():
    ap = argparse.ArgumentParser(description="ArUco marker detection (Step 1)")
    ap.add_argument("--image", help="静止画で検出（カメラ無しの確認用）")
    ap.add_argument("--list", action="store_true", help="使えるカメラ番号を探す")
    args = ap.parse_args()

    if args.list:
        list_cameras()
    elif args.image:
        run_image(args.image)
    else:
        run_camera()


if __name__ == "__main__":
    main()
