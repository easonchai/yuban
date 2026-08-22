"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, playTts, UnauthedError } from "@/lib/api";
import { Connect, SessionHead } from "@/components/Shell";

type Card = { id: number; word: string; pinyin: string; gloss: string; strength: number; context?: string; lastSeen?: string };
const GRADES = [
  { g: 1, label: "Again", cls: "again" },
  { g: 2, label: "Hard", cls: "hard" },
  { g: 3, label: "Good", cls: "good" },
  { g: 4, label: "Easy", cls: "easy" },
] as const;

const daysAgo = (iso?: string) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)) : null);

export default function Flashcards() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [unauthed, setUnauthed] = useState(false);
  const [graded, setGraded] = useState(0);

  useEffect(() => {
    apiGet<{ cards: Card[] }>("/api/deck")
      .then((d) => setCards(d.cards))
      .catch((e) => (e instanceof UnauthedError ? setUnauthed(true) : console.error(e)));
  }, []);

  const card = cards?.[idx];

  const reveal = () => {
    if (!card) return;
    setRevealed(true);
    playTts(card.word);
  };

  const grade = async (g: 1 | 2 | 3 | 4) => {
    if (!card) return;
    void apiPost("/api/grade", { cardId: card.id, grade: g });
    setGraded((n) => n + 1);
    setRevealed(false);
    setIdx((i) => i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        reveal();
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        void grade(Number(e.key) as 1 | 2 | 3 | 4);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (unauthed) return <Connect />;
  if (!cards) return <div className="shell muted" style={{ paddingTop: 80 }}>loading…</div>;

  const seen = daysAgo(card?.lastSeen);

  return (
    <div className="shell narrow" style={{ maxWidth: 560 }}>
      <SessionHead right={cards.length ? `${Math.min(idx + 1, cards.length)} of ${cards.length}` : undefined} />
      <div className="meter" style={{ marginBottom: 30 }}>
        <div style={{ width: `${(idx / Math.max(1, cards.length)) * 100}%` }} />
      </div>

      {!card ? (
        <div className="card pop" style={{ textAlign: "center", padding: "36px 28px", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          {cards.length === 0 ? (
            <>
              <span className="zh" style={{ fontSize: 28, color: "var(--jade)" }}>都跟上了</span>
              <span className="serif" style={{ fontSize: 24 }}>Nothing due right now</span>
              <span style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.5, maxWidth: 340 }}>
                Your words come back when the schedule says so. Chat catches new ones in the meantime.
              </span>
              <Link href="/chat" className="btn dark" style={{ marginTop: 10 }}>Open chat</Link>
            </>
          ) : (
            <>
              <span className="zh" style={{ fontSize: 30, color: "var(--jade)" }}>好样的</span>
              <span className="serif" style={{ fontSize: 26 }}>{graded} words reviewed</span>
              <span style={{ fontSize: 14, color: "var(--body)" }}>That is today handled. Streak safe.</span>
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <Link href="/today" className="btn dark">Back to Today</Link>
                <Link href="/tones" className="btn outline">Tone trainer</Link>
              </div>
            </>
          )}
        </div>
      ) : !revealed ? (
        <div key={card.id} style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
          <div className="card pop" style={{ width: "100%", padding: "56px 28px", textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
            <span className="kicker">How do you say</span>
            <span className="serif" style={{ fontSize: 38, lineHeight: 1.1 }}>{card.gloss}</span>
            {card.context && card.context !== "general" && card.context !== "starter" && (
              <span style={{ fontSize: 13, marginTop: 6 }} className="muted">from {card.context}</span>
            )}
          </div>
          <button className="btn dark rise r2" style={{ width: "100%", padding: "16px 0", fontSize: 16 }} onClick={reveal}>
            Show answer
          </button>
          <span style={{ fontSize: 13 }} className="muted rise r3">
            Strength {"●".repeat(card.strength)}{"○".repeat(5 - card.strength)}
            {seen !== null && seen > 0 && ` · seen ${seen} day${seen === 1 ? "" : "s"} ago`}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
          <div className="card pop" style={{ width: "100%", padding: "36px 28px", textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            <span className="kicker">{card.gloss}</span>
            <span className="zh" style={{ fontSize: 64, lineHeight: 1.1 }}>{card.word}</span>
            <span style={{ fontSize: 19, fontStyle: "italic", color: "var(--muted-deep)" }}>{card.pinyin}</span>
            <button className="starter-chip" style={{ marginTop: 8, border: "1.5px solid var(--red)", color: "var(--red)", background: "transparent" }} onClick={() => playTts(card.word)}>
              ▶ &nbsp;Play again
            </button>
          </div>
          <div className="grade-grid rise r1">
            {GRADES.map(({ g, label, cls }) => (
              <button key={g} className={`grade ${cls}`} onClick={() => grade(g)}>
                {label}
                <span className="key">{g}</span>
              </button>
            ))}
          </div>
          <span style={{ fontSize: 13 }} className="muted rise r2">Audio played on reveal. Desktop: space reveals, 1 to 4 grades.</span>
        </div>
      )}
    </div>
  );
}
