import { useEffect, useState } from "react";

// Solari board 的パタパタアニメーション。
// 値が変わったとき、文字ごとに短い時間差で flip する簡易実装。
// 派手な物理アニメーションは避け、フェード + 微小な縦方向のシフトで「めくれた」雰囲気だけ出す。

export default function FlipText({
  value = "",
  width,
  color = "#ddd",
  fontSize = 18,
  letterSpacing = 2,
  align = "left",
  padding = 0,
}) {
  const [display, setDisplay] = useState(value);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (value === display) return;
    setFlipping(true);
    const t = setTimeout(() => {
      setDisplay(value);
      setFlipping(false);
    }, 200);
    return () => clearTimeout(t);
  }, [value, display]);

  return (
    <span
      style={{
        display: "inline-block",
        width,
        color,
        fontSize,
        letterSpacing,
        textAlign: align,
        padding,
        fontFamily: "monospace",
        opacity: flipping ? 0.3 : 1,
        transform: flipping ? "translateY(-2px)" : "translateY(0)",
        transition: "opacity 0.18s ease-out, transform 0.18s ease-out, color 0.18s",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {display || "—"}
    </span>
  );
}
