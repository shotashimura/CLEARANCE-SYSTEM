#!/usr/bin/env python3
# 印刷用 ArUco マーカーを生成する。
#   - markers/marker_<id>.png       各マーカー個別（ラベル付き）
#   - markers/sheet_A4.png          5枚を1枚にまとめたA4シート（机テスト用に便利）
#
# 使い方:  python generate_markers.py
# 印刷時:  「実際のサイズ(100%)」で印刷。印刷後に一辺を定規で測り、
#          config.MARKER_LENGTH_MM を実測値に合わせると pose 推定が正確になる。
import os
import cv2
import numpy as np

import config
from aruco_compat import get_dictionary, generate_marker_image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "markers")


def mm_to_px(mm, dpi):
    return int(round(mm / 25.4 * dpi))


def labeled_marker(dictionary, marker_id, side_px, quiet_px, label):
    """白フチ(quiet zone)とラベル付きのマーカー画像を作る。"""
    marker = generate_marker_image(dictionary, marker_id, side_px)
    marker = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)
    label_h = max(40, side_px // 8)
    canvas = np.full(
        (side_px + quiet_px * 2 + label_h, side_px + quiet_px * 2, 3), 255, np.uint8
    )
    canvas[quiet_px : quiet_px + side_px, quiet_px : quiet_px + side_px] = marker
    cv2.putText(
        canvas,
        label,
        (quiet_px, side_px + quiet_px * 2 + label_h - 12),
        cv2.FONT_HERSHEY_SIMPLEX,
        max(0.5, side_px / 700),
        (0, 0, 0),
        2,
        cv2.LINE_AA,
    )
    return canvas


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    dictionary = get_dictionary(config.ARUCO_DICT)
    side_px = mm_to_px(config.MARKER_LENGTH_MM, config.PRINT_DPI)
    quiet_px = side_px // 6  # 白フチは1モジュールぶん程度

    tiles = []
    for mid in config.MARKER_IDS:
        suitcase = mid  # marker ID = suitcaseId
        label = f"SUITCASE #{suitcase}  (ArUco ID={mid})"
        tile = labeled_marker(dictionary, mid, side_px, quiet_px, label)
        path = os.path.join(OUT_DIR, f"marker_{mid}.png")
        cv2.imwrite(path, tile)
        print(f"  wrote {path}  ({config.MARKER_LENGTH_MM}mm @ {config.PRINT_DPI}dpi)")
        tiles.append(tile)

    # --- A4シート（150dpi・縦）に5枚を縮小配置 ---
    a4_w = mm_to_px(210, 150)
    a4_h = mm_to_px(297, 150)
    sheet = np.full((a4_h, a4_w, 3), 255, np.uint8)
    margin = mm_to_px(10, 150)
    cell_w = (a4_w - margin * 2) // 2
    rows = (len(tiles) + 1) // 2
    cell_h = (a4_h - margin * 2) // rows
    for idx, tile in enumerate(tiles):
        r, c = divmod(idx, 2)
        scale = min(cell_w / tile.shape[1], cell_h / tile.shape[0]) * 0.9
        small = cv2.resize(tile, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        y = margin + r * cell_h
        x = margin + c * cell_w
        sheet[y : y + small.shape[0], x : x + small.shape[1]] = small
    sheet_path = os.path.join(OUT_DIR, "sheet_A4.png")
    cv2.imwrite(sheet_path, sheet)
    print(f"  wrote {sheet_path}  (A4・5枚まとめ。机テストはこれを1枚印刷でOK)")


if __name__ == "__main__":
    main()
