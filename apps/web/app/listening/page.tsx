"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, playTts, UnauthedError } from "@/lib/api";
import { Connect, SessionHead } from "@/components/Shell";

type Sentence = { hanzi: string; pinyin: string; english: string; targetWord: string };

export default function Listening() {
  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [thin, setThin] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unauthed, setUnauthed] = useState(false);
  const [count, setCount] = useState(0);
  const [playing, setPlaying] = useState(false);

  const play = (text: string) => {
    const a = playTts(text);
    setPlaying(true);
    const done = () => setPlaying(false);
    a.addEventListener("ended", done, { once: true });
    a.addEventListener("pause", done, { once: true });
    a.addEventListener("error", done, { once: true });
  };

  const load = () => {
    setLoading(true);
    setRevealed(false);
    setSentence(null);
    apiGet<{ sentence: Sentence | null }>("/api/listening/next")
      .then((d) => {
        setSentence(d.sentence);
        setThin(!d.sentence);
        setLoading(false);
        if (d.sentence) setTimeout(() => play(d.sentence!.hanzi), 400);
      })
      .catch((e) => (e instanceof UnauthedError ? setUnauthed(true) : console.error(e)));
  };
  useEffect(load, []);

  if (unauthed) return <Connect />;

  const answer = async (got: boolean) => {
    if (!sentence) return;
    void apiPost("/api/listening/result", { targetWord: sentence.targetWord, got });
    setCount((n) => n + 1);
    load();
  };

  return (
    <div className="shell narrow" style={{ maxWidth: 560 }}>
      <SessionHead endTo="/today" right={count > 0 ? `Rep ${count + 1}` : undefined} />

      {loading ? (
        <div className="card pop" style={{ padding: "28px 26px", display: "flex", flexDirection: "column", gap: 10, alignItems: "center", textAlign: "center", marginTop: 20 }}>
          <div className="breath-dots"><span /><span /><span /></div>
          <span style={{ fontSize: 15, fontWeight: 800 }}>Building a sentence from your words</span>
          <span style={{ fontSize: 13 }} className="muted">A few seconds. Worth it, it is yours alone.</span>
        </div>
      ) : thin ? (
        <div className="card pop" style={{ padding: "28px 26px", display: "flex", flexDirection: "column", gap: 8, alignItems: "center", textAlign: "center", marginTop: 20 }}>
          <span className="zh" style={{ fontSize: 28, color: "var(--red)" }}>聊</span>
          <span style={{ fontSize: 15, fontWeight: 800 }}>Your sentences are still brewing</span>
          <span style={{ fontSize: 13, lineHeight: 1.5 }} className="muted">
            Listening needs a few more words to build from. Go chat for a bit,
            the words will pile up fast.
          </span>
          <Link href="/chat" className="btn dark" style={{ marginTop: 6 }}>Open chat</Link>
        </div>
      ) : !revealed && sentence ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, alignItems: "center", marginTop: 12 }}>
          <span style={{ fontSize: 14, color: "var(--muted-deep)" }} className="rise">Listen, then translate in your head</span>
          <button className="bigplay pop" onClick={() => play(sentence.hanzi)} disabled={playing}>
            {playing ? "〜" : "▶"}
          </button>
          <span style={{ fontSize: 13, fontWeight: 700 }} className="muted rise r2">
            {playing ? "Playing... replay unlocks when it ends" : "Replay is free, always"}
          </span>
          <button className="btn dark rise r2" style={{ width: "100%", padding: "16px 0", fontSize: 16 }} onClick={() => setRevealed(true)}>
            Show the sentence
          </button>
          <span style={{ fontSize: 13 }} className="muted rise r3">Every word in it is from your book</span>
        </div>
      ) : sentence ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center", marginTop: 8 }}>
          <div className="card pop" style={{ width: "100%", padding: "30px 26px", textAlign: "center", display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
            <span className="zh" style={{ fontSize: 27, lineHeight: 1.4 }}>{sentence.hanzi}</span>
            <span style={{ fontSize: 16, fontStyle: "italic", color: "var(--muted-deep)" }}>{sentence.pinyin}</span>
            <span style={{ fontSize: 15, color: "var(--body)" }}>{sentence.english}</span>
            <button
              className="starter-chip"
              style={{ marginTop: 10, border: "1.5px solid var(--red)", color: "var(--red)", background: "transparent" }}
              onClick={() => play(sentence.hanzi)}
              disabled={playing}
            >
              ▶ &nbsp;Hear it again
            </button>
          </div>
          <span style={{ fontSize: 14, color: "var(--muted-deep)" }} className="rise r1">Did you catch it?</span>
          <div style={{ display: "flex", gap: 10, width: "100%" }} className="rise r1">
            <button className="grade again" style={{ flex: 1, borderRadius: 16, padding: "15px 0", fontSize: 15 }} onClick={() => answer(false)}>
              Missed it
            </button>
            <button className="grade easy" style={{ flex: 1, borderRadius: 16, padding: "15px 0", fontSize: 15 }} onClick={() => answer(true)}>
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
