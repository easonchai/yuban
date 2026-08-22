"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, prewarmTts, UnauthedError } from "@/lib/api";
import { Connect, Nav, ConnectTelegramButton, PlayBtn } from "@/components/Shell";

type Me = {
  id: string;
  username: string;
  streak: number;
  dueCount: number;
  totalWords: number;
  latest: { word: string; pinyin: string; gloss: string }[];
};

const GREETINGS: Array<[number, string, string]> = [
  [5, "早上好", "Good morning"],
  [12, "下午好", "Good afternoon"],
  [18, "晚上好", "Good evening"],
];

function greeting(now = new Date()): [string, string] {
  const h = now.getHours();
  let out: [string, string] = ["晚上好", "Good evening"];
  for (const [from, zh, en] of GREETINGS) if (h >= from) out = [zh, en];
  return out;
}

export default function Today() {
  const [me, setMe] = useState<Me | null>(null);
  const [unauthed, setUnauthed] = useState(false);

  useEffect(() => {
    apiGet<Me>("/api/me")
      .then((m) => {
        setMe(m);
        m.latest.forEach((w) => prewarmTts(w.word)); // chips play instantly
      })
      .catch((e) => (e instanceof UnauthedError ? setUnauthed(true) : console.error(e)));
  }, []);

  if (unauthed) return <Connect />;
  if (!me) return <div className="shell muted" style={{ paddingTop: 80 }}>loading…</div>;

  const isGuest = me.id.startsWith("-");
  const [zhGreet, enGreet] = greeting();
  const dateLine = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const activities = [
    { href: "/chat", glyph: "聊", title: "Chat", sub: "Talk about your day", subHot: false },
    { href: "/flashcards", glyph: "忆", title: "Flashcards", sub: me.dueCount ? `${me.dueCount} due` : "All on schedule", subHot: me.dueCount > 0 },
    { href: "/tones", glyph: "声", title: "Tone trainer", sub: "8 quick rounds", subHot: false },
    { href: "/listening", glyph: "听", title: "Listening", sub: "Sentences you know", subHot: false },
  ];

  return (
    <div className="shell">
      <Nav streak={me.streak} words={me.totalWords} />

      <div className="rise" style={{ display: "flex", alignItems: "baseline", gap: 14, margin: "14px 0 22px", flexWrap: "wrap" }}>
        <span className="zh" style={{ fontSize: 30 }}>{zhGreet}</span>
        <span style={{ fontSize: 16 }} className="muted">{enGreet}. {dateLine}.</span>
      </div>

      <div className="stat-grid cascade">
        {me.dueCount > 0 ? (
          <div style={{ background: "var(--red)", color: "var(--cream)", borderRadius: 18, padding: "28px 32px", display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span className="serif" style={{ fontSize: 64, lineHeight: 1 }}>{me.dueCount}</span>
              <span style={{ fontSize: 18, fontWeight: 700 }}>words due</span>
            </div>
            <div style={{ fontSize: 14, opacity: 0.85 }}>Ready when you are. Strong words wait longer.</div>
            <Link href="/flashcards" className="btn on-red" style={{ alignSelf: "flex-start", marginTop: 12, padding: "10px 22px" }}>
              Review now
            </Link>
          </div>
        ) : (
          <div className="card flat" style={{ display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
            <span className="zh" style={{ fontSize: 26, color: "var(--jade)" }}>都跟上了</span>
            <span style={{ fontSize: 16, fontWeight: 800 }}>All on schedule</span>
            <span style={{ fontSize: 13, lineHeight: 1.5 }} className="muted">
              Nothing is due right now. Your words come back when it is time.
              Go chat and catch some new ones.
            </span>
          </div>
        )}
        <div className="card flat" style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" }}>
          <span className="serif" style={{ fontSize: 46, lineHeight: 1, color: "var(--jade)" }}>{me.streak}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--jade)" }}>day streak</span>
          <span style={{ fontSize: 13, marginTop: 4 }} className="muted">
            {me.streak >= 7 ? "A week of stacked wins." : me.streak > 0 ? "Stacked wins, one a day." : "One drill starts it."}
          </span>
        </div>
        <div className="card flat" style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" }}>
          <span className="serif" style={{ fontSize: 46, lineHeight: 1 }}>{me.totalWords}</span>
          <span style={{ fontSize: 15, fontWeight: 700 }}>words in your book</span>
          <span style={{ fontSize: 13, marginTop: 4 }} className="muted">All caught from real chats.</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 24 }} className="cascade">
        {activities.map((a) => (
          <Link key={a.href} href={a.href} className="card flat" style={{ display: "flex", alignItems: "center", gap: 16, padding: "22px 24px", textDecoration: "none", color: "inherit" }}>
            <span className="glyph-circle">{a.glyph}</span>
            <span>
              <span style={{ display: "block", fontWeight: 800, fontSize: 16 }}>{a.title}</span>
              <span style={{ display: "block", fontSize: 13, fontWeight: a.subHot ? 700 : 400, color: a.subHot ? "var(--red)" : "var(--muted)" }}>{a.sub}</span>
            </span>
          </Link>
        ))}
      </div>

      {isGuest && (
        <div className="card gold rise r3" style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>Keep your progress</span>
          <span style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>
            Connect Telegram and your words, chats, and streak come with you.
            Your tutor can check in on you there too.
          </span>
          <div style={{ marginTop: 4 }}>
            <ConnectTelegramButton />
          </div>
        </div>
      )}

      {me.latest.length > 0 && (
        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="kicker">Fresh from your chats</span>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }} className="cascade">
            {me.latest.map((w) => (
              <span key={w.word} className="word-chip">
                <span className="hz zh">{w.word}</span>
                <span className="py">{w.pinyin}</span>
                <PlayBtn text={w.word} />
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
