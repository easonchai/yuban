"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, playUrl, UnauthedError } from "@/lib/api";
import { Connect, SessionHead } from "@/components/Shell";

type Item = { hanzi: string; pinyin: string; tone: number };
const TONES = [1, 2, 3, 4];
const MARKS: Record<number, string> = { 1: "ˉ", 2: "ˊ", 3: "ˇ", 4: "ˋ" };

export default function Tones() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [playing, setPlaying] = useState(false);
  const [unauthed, setUnauthed] = useState(false);

  // Native human recordings for isolated tones (TTS reads them lazily).
  const play = (it: Item) => {
    const a = playUrl(`/api/tone-audio?py=${encodeURIComponent(it.pinyin)}&hz=${encodeURIComponent(it.hanzi)}`);
    setPlaying(true);
    const done = () => setPlaying(false);
    a.addEventListener("ended", done, { once: true });
    a.addEventListener("pause", done, { once: true });
    a.addEventListener("error", done, { once: true });
  };

  const load = () => {
    setItems(null);
    setIdx(0);
    setPicked(null);
    setResults([]);
    apiGet<{ items: Item[] }>("/api/tones/round")
      .then((d) => {
        setItems(d.items);
        if (d.items[0]) setTimeout(() => play(d.items[0]), 400);
      })
      .catch((e) => (e instanceof UnauthedError ? setUnauthed(true) : console.error(e)));
  };
  useEffect(load, []);

  if (unauthed) return <Connect />;
  if (!items) return <div className="shell muted" style={{ paddingTop: 80 }}>loading…</div>;

  const item = items[idx];
  const done = !item;
  const right = results.filter(Boolean).length;

  const advance = () => {
    setPicked(null);
    const next = idx + 1;
    setIdx(next);
    if (items[next]) play(items[next]);
    else void apiPost("/api/tones/result", { right, total: items.length });
  };

  const pick = (n: number) => {
    if (picked !== null || !item) return;
    setPicked(n);
    const ok = n === item.tone;
    setResults((r) => [...r, ok]);
    if (ok) setTimeout(advance, 750);
  };

  const byTone = TONES.map((t) => {
    const mine = items.map((it, i) => ({ it, res: results[i] })).filter(({ it }, i) => i < results.length && it.tone === t);
    return { t, r: mine.filter((m) => m.res).length, n: mine.length };
  });

  return (
    <div className="shell narrow" style={{ maxWidth: 560 }}>
      <SessionHead endTo="/today" right={done ? undefined : `${idx + 1} of ${items.length}`} />
      <div className="segments" style={{ marginBottom: 34 }}>
        {items.map((_, i) => (
          <span key={i} className={i < results.length ? (results[i] ? "good" : "bad") : i === idx ? "now" : ""} />
        ))}
      </div>

      {done ? (
        <div className="card pop" style={{ padding: "30px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="serif" style={{ fontSize: 44, lineHeight: 1 }}>{right} of {items.length}</span>
            <span style={{ fontSize: 14, color: "var(--muted-deep)" }}>
              {right >= items.length - 1 ? "Sharp ears today." : "Your ear is coming along."}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {byTone.map(({ t, r, n }) => (
              <div key={t} className="bar-row">
                <span className="lab">{MARKS[t]} &nbsp;T{t}</span>
                <span className="track">
                  <span style={{ width: n ? `${(r / n) * 100}%` : "0%", background: n && r === n ? "var(--jade)" : "var(--red)" }} />
                </span>
                <span className="val" style={{ color: n && r === n ? "var(--jade)" : "var(--red)" }}>{n ? `${r}/${n}` : "–"}</span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: 13, textAlign: "center" }} className="muted">
            Second and third tones trip everyone up. They get more practice next round.
          </span>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn" onClick={load}>Go again</button>
            <Link href="/today" className="btn outline">Done for now</Link>
          </div>
        </div>
      ) : picked === null ? (
        <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 26, alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "var(--muted-deep)" }} className="rise">Which tone do you hear?</span>
          <button className="bigplay pop" onClick={() => play(item)} disabled={playing}>▶</button>
          <span style={{ fontSize: 13, fontWeight: 700 }} className="muted rise r2">Replay as many times as you like</span>
          <div className="grade-grid rise r2" style={{ gap: 10 }}>
            {TONES.map((t) => (
              <button key={t} className="tone-tile" onClick={() => pick(t)}>
                <span className="mark">{MARKS[t]}</span>
                <span className="lbl">TONE {t}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center" }}>
          {picked === item.tone ? (
            <span className="result-pill good pop">好耳朵 · Got it</span>
          ) : (
            <span className="result-pill bad pop">Not this time</span>
          )}
          <div className={`pop ${picked !== item.tone ? "shake" : ""}`} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
            <span className="zh" style={{ fontSize: 52, lineHeight: 1 }}>{item.hanzi}</span>
            <span style={{ fontSize: 18, fontStyle: "italic", color: "var(--muted-deep)" }}>{item.pinyin} · tone {item.tone}</span>
            <span style={{ fontSize: 13 }} className="muted">from your word book</span>
          </div>
          <div className="grade-grid" style={{ gap: 10 }}>
            {TONES.map((t) => (
              <span
                key={t}
                className={`tone-tile ${t === item.tone ? "answer" : t === picked ? "wrongpick" : "dim"}`}
                style={{ cursor: "default" }}
              >
                <span className="mark">{MARKS[t]}</span>
                <span className="lbl">{t === item.tone && picked !== item.tone ? "ANSWER" : t === picked && picked !== item.tone ? "YOUR PICK" : `TONE ${t}`}</span>
              </span>
            ))}
          </div>
          {picked !== item.tone && (
            <div style={{ display: "flex", gap: 10, width: "100%" }} className="rise r1">
              <button className="btn outline" style={{ flex: 1 }} onClick={() => play(item)} disabled={playing}>
                ▶ Hear it again
              </button>
              <button className="btn dark" style={{ flex: 1 }} onClick={advance}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
