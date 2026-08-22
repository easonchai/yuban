"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, prewarmTts, UnauthedError } from "@/lib/api";
import { Connect, Nav, ConnectTelegramButton, PlayBtn } from "@/components/Shell";

type Msg = { role: "user" | "assistant"; content: string; ts?: string };
const CJK = /[一-鿿]/;
const PINYIN_HINT = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i;

const splitParts = (text: string) =>
  text.split(/\n\s*---\s*\n/).map((p) => p.trim()).filter(Boolean).slice(0, 3);

function dayLabel(ts: string | undefined, now = new Date()): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  const day = (x: Date) => x.toISOString().slice(0, 10);
  if (day(d) === day(now)) return "TODAY";
  if (day(d) === day(new Date(now.getTime() - 864e5))) return "YESTERDAY";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" }).toUpperCase();
}

/** Render a bot part: consecutive hanzi/pinyin/english lines become a tri-line. */
function BotBubble({ content }: { content: string }) {
  const lines = content.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    if (CJK.test(lines[i]) && i + 2 < lines.length && PINYIN_HINT.test(lines[i + 1]) && lines[i + 2].trim() && !CJK.test(lines[i + 2])) {
      const hz = lines[i];
      out.push(
        <span key={i} className="triline" style={{ margin: "4px 0" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="hz zh">{hz}</span>
            <PlayBtn text={hz} />
          </span>
          <span className="py">{lines[i + 1]}</span>
          <span className="en">{lines[i + 2]}</span>
        </span>,
      );
      i += 3;
      continue;
    }
    const line = lines[i];
    out.push(
      CJK.test(line) ? (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>{line}</span>
          <PlayBtn text={line} />
        </span>
      ) : (
        <span key={i} style={{ display: "block" }}>{line || " "}</span>
      ),
    );
    i += 1;
  }
  return <div className="bub bot rise">{out}</div>;
}

export default function Chat() {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [wall, setWall] = useState<string | null>(null);
  const [unauthed, setUnauthed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGet<{ messages: Msg[] }>("/api/chat/history")
      .then((d) =>
        setMsgs(
          d.messages.flatMap((m) =>
            m.role === "assistant" ? splitParts(m.content).map((content) => ({ ...m, content })) : [m],
          ),
        ),
      )
      .catch((e) => (e instanceof UnauthedError ? setUnauthed(true) : console.error(e)));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  if (unauthed) return <Connect />;
  if (!msgs) return <div className="shell muted" style={{ paddingTop: 80 }}>loading…</div>;

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy || wall) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...(m ?? []), { role: "user", content: text, ts: new Date().toISOString() }]);
    try {
      const d = await apiPost<{ reply: string | null; wall: string | null }>("/api/chat", { text });
      if (d.wall) setWall(d.wall);
      else if (d.reply) {
        // pre-warm every Mandarin line NOW so the play tap is instant later
        for (const line of d.reply.split("\n")) if (CJK.test(line)) prewarmTts(line.trim());
        setMsgs((m) => [
          ...(m ?? []),
          ...splitParts(d.reply!).map((content) => ({ role: "assistant" as const, content, ts: new Date().toISOString() })),
        ]);
      }
    } catch (e) {
      if (e instanceof UnauthedError) setUnauthed(true);
      else console.error(e);
    }
    setBusy(false);
  };

  let lastDay: string | null = null;

  return (
    <div className="shell narrow" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", paddingBottom: 90 }}>
      <Nav />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, paddingBottom: 14 }}>
        {msgs.length === 0 && (
          <div className="card pop" style={{ textAlign: "center", padding: "32px 26px", margin: "24px auto 0", maxWidth: 420, display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
            <span className="zh" style={{ fontSize: 34, color: "var(--red)" }}>聊</span>
            <span className="serif" style={{ fontSize: 24, lineHeight: 1.2 }}>Say hi, in any language</span>
            <span style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>
              Tell me about your day, or ask how to say anything. Try "how do I say I need coffee".
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {["say hi", "how do I say...", "my day was..."].map((c) => (
                <button key={c} className="starter-chip" onClick={() => setInput(c === "say hi" ? "hi!" : c.replace("...", " "))}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => {
          const label = dayLabel(m.ts);
          const divider = label && label !== lastDay ? <div key={`d${i}`} className="divider" style={{ margin: "10px 0" }}>{label}</div> : null;
          if (label) lastDay = label;
          return (
            <span key={i} style={{ display: "contents" }}>
              {divider}
              {m.role === "user" ? (
                <div className="bub user rise" style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
              ) : (
                <BotBubble content={m.content} />
              )}
            </span>
          );
        })}
        {busy && <div className="typing rise" style={{ alignSelf: "flex-start" }}><span /><span /><span /></div>}
        {wall && (
          <div className="card gold pop" style={{ margin: "12px auto 0", maxWidth: 440, display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="pill redsoft" style={{ alignSelf: "flex-start", letterSpacing: 0.5, fontSize: 11 }}>
              {wall === "trial_over" ? "25 OF 25 FREE MESSAGES USED" : "NO ACTIVE ACCESS"}
            </span>
            <span className="serif" style={{ fontSize: 26, lineHeight: 1.15 }}>Keep talking with your tutor</span>
            <span style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.55 }}>
              $20 for 30 days, and renewing early just adds 30 more. Everything you built here comes with you.
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14, color: "var(--body)" }}>
              <span style={{ display: "flex", gap: 10 }}><b style={{ color: "var(--red)" }}>1</b>Connect Telegram below</span>
              <span style={{ display: "flex", gap: 10 }}><b style={{ color: "var(--red)" }}>2</b>Send <b style={{ color: "var(--ink)" }}>/activate YB-XXXXXXXX</b> to the bot</span>
              <span style={{ display: "flex", gap: 10 }}><b style={{ color: "var(--red)" }}>3</b>Come back, everything is unlocked</span>
            </div>
            <ConnectTelegramButton />
            <span style={{ fontSize: 13, textAlign: "center" }} className="muted">Your words and streak are safe. Drills stay free below.</span>
            <div style={{ display: "flex", gap: 10 }}>
              <Link href="/flashcards" className="starter-chip" style={{ flex: 1, textAlign: "center", background: "var(--chip)", textDecoration: "none" }}>Flashcards</Link>
              <Link href="/tones" className="starter-chip" style={{ flex: 1, textAlign: "center", background: "var(--chip)", textDecoration: "none" }}>Tones</Link>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          placeholder={wall ? "Chat is paused" : "Message your tutor"}
          disabled={!!wall}
        />
        <button className="send" onClick={() => void send()} disabled={busy || !!wall}>↑</button>
      </div>
    </div>
  );
}
