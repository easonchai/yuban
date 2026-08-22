"use client";
import { useEffect, useState } from "react";
import { pinyin } from "pinyin-pro";

const CJK_G = /[一-鿿]+/g;

/**
 * Global pinyin tooltip: hover any .zh element anywhere and see how to say
 * it. Tri-lines are skipped, their pinyin is already on screen.
 */
export default function PinyinTip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(".zh") as HTMLElement | null;
      if (!el || el.closest(".triline")) return;
      const hanzi = (el.textContent ?? "").match(CJK_G)?.join("") ?? "";
      if (!hanzi) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const r = el.getBoundingClientRect();
        setTip({
          text: pinyin(hanzi, { toneType: "symbol" }),
          x: Math.min(r.left + r.width / 2, innerWidth - 20),
          y: r.top,
        });
      }, 180);
    };

    const out = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(".zh");
      if (!el) return;
      if (timer) clearTimeout(timer);
      setTip(null);
    };

    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("scroll", () => setTip(null), true);
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      className="pinyin-tip pop"
      style={{ left: tip.x, top: tip.y }}
      role="tooltip"
    >
      {tip.text}
    </div>
  );
}
